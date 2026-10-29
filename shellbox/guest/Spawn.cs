using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;

namespace Shellbox
{
    // Host-owned catalog and spawn. Garry's Mod writes spawn.txt; this calls
    // FireworksManager.Spawn and lights the result. It does not click the game's buttons.
    static class ShellboxSpawn
    {
        public static Action<string> Info;
        public static Action<string> Error;
        public static int Count;
        public static string Last = "";

        static readonly Dictionary<string, Entry> _defs = new Dictionary<string, Entry>();
        static readonly List<Entry> _order = new List<Entry>();
        static readonly List<Pending> _pending = new List<Pending>();
        static readonly List<Dying> _dying = new List<Dying>();
        static readonly List<float[]> _spots = new List<float[]>();
        static readonly HashSet<uint> _halted = new HashSet<uint>();

        static string _dir;
        static string _lastCat;
        static string _fail;
        static uint _lastSeq;
        static bool _primed;
        static int _phase;
        static bool _catalogLogged;
        static MethodInfo _spawn;
        static object _zero;
        static Type _vector;
        static Type _quat;
        static MethodInfo _euler;

        class Entry
        {
            public string Type;
            public string Id;
            public string Name;
            public bool Place;
            public object Def;
        }

        class Pending
        {
            public float X, Y, Z, Yaw;
            public bool Place;
            public bool Ignite;
            public int Left;
            public HashSet<uint> Before;
            public HashSet<uint> Touched;
        }

        class Dying
        {
            public object Go;
            public int Left;
        }

        public static void Tick(string statePath)
        {
            try
            {
                if (_dir == null) _dir = Path.GetDirectoryName(statePath);
                _phase++;
                if (_defs.Count == 0 || (_phase % 90) == 0) Build();
                ReadSpawn();
                Drain();
                Decay();
            }
            catch (Exception e)
            {
                Fail(e.Message);
            }
        }

        public static float FocusDistance(float x, float y, float z)
        {
            if (_spots.Count == 0) return 1e9f;
            float best = 1e9f;
            for (int i = 0; i < _spots.Count; i++)
            {
                float dx = x - _spots[i][0];
                float dy = y - _spots[i][1];
                float dz = z - _spots[i][2];
                float d = dx * dx + dy * dy + dz * dz;
                if (d < best) best = d;
            }
            return best;
        }

        public static bool Halt(object behaviour, float x, float y, float z)
        {
            if (!U.Alive(behaviour)) return false;
            uint id = U.Id(behaviour);
            if (id != 0 && _halted.Contains(id)) return true;
            try
            {
                Freeze(behaviour, x, y, z, 0f, false);
                object go = U.Get(behaviour, "gameObject");
                Burst(behaviour, go);
                if (U.Alive(go))
                {
                    Dying d = new Dying();
                    d.Go = go;
                    d.Left = 180;
                    _dying.Add(d);
                }
                if (id != 0) _halted.Add(id);
                Note("halt id=" + id);
                return true;
            }
            catch (Exception e)
            {
                Fail("halt: " + e.Message);
                return false;
            }
        }

        static void Build()
        {
            object mgr = Manager();
            if (mgr == null) return;
            object repo = U.Field(mgr, "_entityDefinitionRepository");
            if (repo == null) repo = U.Get(mgr, "EntityDefinitionRepository");
            if (repo == null) return;
            object list = U.Get(repo, "EntityDefinitionList");
            if (list == null) list = U.Field(repo, "EntityDefinitionList");
            if (list == null) list = U.Field(repo, "_entityDefinitionList");
            if (list == null) return;

            var rows = new List<Entry>();
            foreach (object def in Enumerate(list))
            {
                if (def == null) continue;
                try
                {
                    string id = Text(def, "Id");
                    string name = Text(def, "ItemName");
                    if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(name)) continue;
                    object prefab = U.Get(def, "PrefabGameObject");
                    if (prefab == null) prefab = U.Field(def, "PrefabGameObject");
                    if (!U.Alive(prefab)) continue;
                    Entry e = new Entry();
                    e.Def = def;
                    e.Id = Clean(id, 120);
                    e.Name = Clean(name, 80);
                    e.Type = Clean(TypeOf(def), 40);
                    if (e.Type.Length == 0) e.Type = "Item";
                    e.Place = Placeable(e.Type, e.Name);
                    if (e.Id.Length == 0 || e.Name.Length == 0) continue;
                    rows.Add(e);
                }
                catch
                {
                }
            }
            if (rows.Count == 0) return;
            rows.Sort(delegate (Entry a, Entry b)
            {
                int c = string.Compare(a.Type, b.Type, StringComparison.OrdinalIgnoreCase);
                if (c != 0) return c;
                return string.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase);
            });
            if (rows.Count > 400) rows.RemoveRange(400, rows.Count - 400);

            _defs.Clear();
            _order.Clear();
            var seen = new HashSet<string>();
            for (int i = 0; i < rows.Count; i++)
            {
                if (seen.Contains(rows[i].Id)) continue;
                seen.Add(rows[i].Id);
                _defs[rows[i].Id] = rows[i];
                _order.Add(rows[i]);
            }
            Count = _order.Count;
            WriteCatalog();
            if (!_catalogLogged)
            {
                _catalogLogged = true;
                Note("catalog " + Count);
            }
        }

        static void WriteCatalog()
        {
            var sb = new StringBuilder();
            sb.Append("CAT1 ").Append(_order.Count).Append('\n');
            for (int i = 0; i < _order.Count; i++)
            {
                Entry e = _order[i];
                sb.Append(e.Type).Append('\t').Append(e.Id).Append('\t');
                sb.Append(e.Place ? 'P' : 'F').Append('\t').Append(e.Name).Append('\n');
            }
            string text = sb.ToString();
            if (text == _lastCat) return;
            string path = Path.Combine(_dir, "catalog.txt");
            byte[] bytes = new UTF8Encoding(false).GetBytes(text);
            using (var fs = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.ReadWrite))
                fs.Write(bytes, 0, bytes.Length);
            _lastCat = text;
        }

        static void ReadSpawn()
        {
            string path = Path.Combine(_dir, "spawn.txt");
            if (!File.Exists(path))
            {
                _primed = true;
                return;
            }
            string text = ReadText(path, 8192);
            if (text == null) return;
            text = text.Replace("\r", "");
            string[] lines = text.Split('\n');
            if (lines.Length < 4) return;
            if (lines[0].Trim() != "SP1") return;
            uint seq;
            if (!uint.TryParse(lines[1].Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out seq)) return;
            string id = lines[2].Trim();
            string[] p = lines[3].Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            if (id.Length == 0 || p.Length < 9) return;
            if (!_primed)
            {
                _primed = true;
                _lastSeq = seq;
                return;
            }
            if (seq <= _lastSeq) return;
            _lastSeq = seq;
            float x = Parse(p[0]);
            float y = Parse(p[1]);
            float z = Parse(p[2]);
            float yaw = Parse(p[3]);
            float vx = Parse(p[4]);
            float vy = Parse(p[5]);
            float vz = Parse(p[6]);
            bool kin = p[7] != "0";
            bool ignite = p[8] != "0";
            DoSpawn(id, x, y, z, yaw, vx, vy, vz, kin, ignite);
        }

        static void DoSpawn(string id, float x, float y, float z, float yaw, float vx, float vy, float vz, bool kin, bool ignite)
        {
            if (_defs.Count == 0) Build();
            Entry entry;
            if (!_defs.TryGetValue(id, out entry) || entry.Def == null)
            {
                Note("spawn unknown " + id);
                return;
            }
            object mgr = Manager();
            if (mgr == null)
            {
                Note("spawn no manager");
                return;
            }
            MethodInfo spawn = SpawnMethod(mgr.GetType());
            if (spawn == null)
            {
                Note("spawn method missing");
                return;
            }
            object pos = Vec(x, y, z);
            object vel = Vec(vx, vy, vz);
            object rot = YawQuat(yaw);
            if (pos == null || vel == null || rot == null)
            {
                Note("spawn math missing");
                return;
            }
            Pending pending = new Pending();
            pending.X = x;
            pending.Y = y;
            pending.Z = z;
            pending.Yaw = yaw;
            pending.Place = kin;
            pending.Ignite = ignite;
            pending.Left = 90;
            pending.Before = Snapshot();
            pending.Touched = new HashSet<uint>();
            _pending.Add(pending);
            try
            {
                spawn.Invoke(mgr, new object[] { entry.Def, pos, rot, vel, kin, true });
                NoteSpot(x, y, z);
                Note("spawn " + entry.Name);
            }
            catch (TargetInvocationException e)
            {
                Exception inner = e.InnerException != null ? e.InnerException : e;
                Note("spawn failed " + inner.Message);
            }
        }

        static void Drain()
        {
            if (_pending.Count == 0) return;
            Type fw = U.Find("FireworksMania.Core.Behaviors.Fireworks.BaseFireworkBehavior");
            Array all = fw == null ? null : U.FindObjects(fw, false);
            for (int i = _pending.Count - 1; i >= 0; i--)
            {
                Pending p = _pending[i];
                p.Left--;
                if (all != null)
                {
                    object closest = null;
                    uint closestId = 0;
                    float closestD = 16f;
                    for (int n = 0; n < all.Length; n++)
                    {
                        object beh = all.GetValue(n);
                        if (!U.Alive(beh)) continue;
                        uint id = U.Id(beh);
                        if (id == 0 || p.Before.Contains(id) || p.Touched.Contains(id)) continue;
                        object tr = U.Transform(beh);
                        object wp = tr == null ? null : U.Get(tr, "position");
                        if (wp == null) continue;
                        float dx = U.Num(wp, "x") - p.X;
                        float dy = U.Num(wp, "y") - p.Y;
                        float dz = U.Num(wp, "z") - p.Z;
                        float d = dx * dx + dy * dy + dz * dz;
                        if (d < closestD)
                        {
                            closestD = d;
                            closest = beh;
                            closestId = id;
                        }
                    }
                    if (closest != null && p.Touched.Count == 0)
                    {
                        p.Touched.Add(closestId);
                        if (p.Ignite) Burst(closest, U.Get(closest, "gameObject"));
                    }
                    if (p.Place)
                    {
                        for (int n = 0; n < all.Length; n++)
                        {
                            object beh = all.GetValue(n);
                            if (!U.Alive(beh)) continue;
                            uint id = U.Id(beh);
                            if (p.Touched.Contains(id)) Freeze(beh, p.X, p.Y, p.Z, p.Yaw, true);
                        }
                    }
                }
                if (p.Left <= 0) _pending.RemoveAt(i);
            }
        }

        static void Decay()
        {
            for (int i = _dying.Count - 1; i >= 0; i--)
            {
                Dying d = _dying[i];
                d.Left--;
                if (d.Left > 0) continue;
                if (U.Alive(d.Go)) U.Destroy(d.Go);
                _dying.RemoveAt(i);
            }
        }

        static void Freeze(object behaviour, float x, float y, float z, float yaw, bool place)
        {
            object spot = Vec(x, y, z);
            object still = Zero();
            object tr = U.Transform(behaviour);
            if (tr != null && spot != null)
            {
                SetProp(tr, "position", spot);
                if (place)
                {
                    object rot = YawQuat(yaw);
                    if (rot != null) SetProp(tr, "rotation", rot);
                }
            }
            object go = U.Get(behaviour, "gameObject");
            Type rbType = U.Find("UnityEngine.Rigidbody");
            if (go == null || rbType == null) return;
            if (place)
            {
                Still(GetComp(go, rbType), spot, still);
                return;
            }
            Array bodies = U.Components(go, rbType);
            for (int i = 0; i < bodies.Length; i++)
                Still(bodies.GetValue(i), null, still);
        }

        static void Still(object rb, object spot, object still)
        {
            if (!U.Alive(rb)) return;
            SetProp(rb, "isKinematic", true);
            if (spot != null) SetProp(rb, "position", spot);
            if (still == null) return;
            SetProp(rb, "velocity", still);
            SetProp(rb, "linearVelocity", still);
            SetProp(rb, "angularVelocity", still);
        }

        static object GetComp(object go, Type type)
        {
            if (go == null || type == null) return null;
            MethodInfo[] methods = go.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance);
            for (int i = 0; i < methods.Length; i++)
            {
                MethodInfo m = methods[i];
                if (m.Name != "GetComponent" || m.IsGenericMethod) continue;
                ParameterInfo[] ps = m.GetParameters();
                if (ps.Length == 1 && ps[0].ParameterType == typeof(Type))
                    return m.Invoke(go, new object[] { type });
            }
            return null;
        }

        static void Burst(object behaviour, object go)
        {
            if (!U.Alive(behaviour)) return;
            try
            {
                object flag = U.Get(behaviour, "IsIgnited");
                bool lit = flag is bool && (bool)flag;
                if (!lit) Call(behaviour, "IgniteInstant");
            }
            catch (Exception e)
            {
                Fail("ignite: " + e.Message);
            }
            try
            {
                Call(behaviour, "Explode");
            }
            catch (Exception e)
            {
                Fail("explode: " + e.Message);
            }
            if (!U.Alive(go)) return;
            Type fuse = U.Find("FireworksMania.Core.Behaviors.Fireworks.Parts.Fuse");
            if (fuse == null) return;
            Array fuses = U.Components(go, fuse);
            for (int i = 0; i < fuses.Length; i++)
            {
                try
                {
                    object f = fuses.GetValue(i);
                    if (!U.Alive(f)) continue;
                    Call(f, "IgniteInstant");
                    Call(f, "IgniteWithoutFuseTime");
                }
                catch
                {
                }
            }
        }

        static void Call(object o, string name)
        {
            if (o == null) return;
            MethodInfo m = o.GetType().GetMethod(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic, null, Type.EmptyTypes, null);
            if (m == null) return;
            m.Invoke(o, null);
        }

        static HashSet<uint> Snapshot()
        {
            var ids = new HashSet<uint>();
            Type fw = U.Find("FireworksMania.Core.Behaviors.Fireworks.BaseFireworkBehavior");
            if (fw == null) return ids;
            Array all = U.FindObjects(fw, false);
            for (int i = 0; i < all.Length; i++)
            {
                uint id = U.Id(all.GetValue(i));
                if (id != 0) ids.Add(id);
            }
            return ids;
        }

        static void NoteSpot(float x, float y, float z)
        {
            _spots.Add(new float[] { x, y, z });
            if (_spots.Count > 8) _spots.RemoveAt(0);
        }

        static object Manager()
        {
            Type t = U.Find("FireworksMania.Common.FireworksManager");
            if (t == null) return null;
            PropertyInfo p = t.GetProperty("Instance", BindingFlags.Public | BindingFlags.Static);
            if (p == null) return null;
            object inst = p.GetValue(null, null);
            if (!U.Alive(inst)) return null;
            return inst;
        }

        static MethodInfo SpawnMethod(Type t)
        {
            if (_spawn != null) return _spawn;
            MethodInfo[] methods = t.GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            for (int i = 0; i < methods.Length; i++)
            {
                MethodInfo m = methods[i];
                if (m.Name != "Spawn") continue;
                ParameterInfo[] ps = m.GetParameters();
                if (ps.Length != 6) continue;
                if (ps[3].ParameterType.Name != "Vector3") continue;
                if (ps[4].ParameterType != typeof(bool)) continue;
                _spawn = m;
                if (ps[0].ParameterType.Name.IndexOf("Definition", StringComparison.Ordinal) >= 0) return m;
            }
            return _spawn;
        }

        static object Vec(float x, float y, float z)
        {
            if (_vector == null) _vector = U.Find("UnityEngine.Vector3");
            if (_vector == null) return null;
            return Activator.CreateInstance(_vector, new object[] { x, y, z });
        }

        static object Zero()
        {
            if (_zero == null) _zero = Vec(0f, 0f, 0f);
            return _zero;
        }

        static object YawQuat(float yaw)
        {
            if (_quat == null) _quat = U.Find("UnityEngine.Quaternion");
            if (_quat == null) return null;
            if (_euler == null)
                _euler = _quat.GetMethod("Euler", new Type[] { typeof(float), typeof(float), typeof(float) });
            if (_euler != null) return _euler.Invoke(null, new object[] { 0f, yaw, 0f });
            PropertyInfo ident = _quat.GetProperty("identity", BindingFlags.Public | BindingFlags.Static);
            if (ident == null) return null;
            return ident.GetValue(null, null);
        }

        static void SetProp(object o, string name, object value)
        {
            if (o == null || value == null) return;
            PropertyInfo p = o.GetType().GetProperty(name, BindingFlags.Instance | BindingFlags.Public);
            if (p == null || !p.CanWrite) return;
            p.SetValue(o, value, null);
        }

        static string TypeOf(object def)
        {
            object cat = U.Get(def, "Category");
            if (cat == null) cat = U.Field(def, "Category");
            string named = cat as string;
            if (!string.IsNullOrEmpty(named)) return named;
            object typ = U.Get(def, "EntityDefinitionType");
            if (typ == null) typ = U.Field(def, "EntityDefinitionType");
            if (typ == null) return "Item";
            string text;
            Type tt = typ.GetType();
            if (tt.IsEnum)
                text = Enum.GetName(tt, typ);
            else
                text = typ.ToString();
            if (string.IsNullOrEmpty(text)) return "Item";
            int dot = text.LastIndexOf('.');
            if (dot >= 0 && dot < text.Length - 1) text = text.Substring(dot + 1);
            if (text == "EntityDefinitionType") return "Item";
            return text;
        }

        static bool Placeable(string typeName, string name)
        {
            string s = (typeName + " " + name).ToLowerInvariant();
            bool loose = s.IndexOf("shell", StringComparison.Ordinal) >= 0
                || s.IndexOf("rocket", StringComparison.Ordinal) >= 0
                || s.IndexOf("comet", StringComparison.Ordinal) >= 0;
            if (!loose) return true;
            if (s.IndexOf("mortar", StringComparison.Ordinal) >= 0) return true;
            if (s.IndexOf("cake", StringComparison.Ordinal) >= 0) return true;
            if (s.IndexOf("fountain", StringComparison.Ordinal) >= 0) return true;
            if (s.IndexOf("tube", StringComparison.Ordinal) >= 0) return true;
            if (s.IndexOf("candle", StringComparison.Ordinal) >= 0) return true;
            if (s.IndexOf("battery", StringComparison.Ordinal) >= 0) return true;
            return false;
        }

        static string Text(object o, string name)
        {
            object v = U.Get(o, name);
            if (v == null) v = U.Field(o, name);
            if (v == null) return null;
            return v as string ?? v.ToString();
        }

        static string Clean(string s, int max)
        {
            if (string.IsNullOrEmpty(s)) return "";
            var b = new StringBuilder(s.Length);
            for (int i = 0; i < s.Length && b.Length < max; i++)
            {
                char c = s[i];
                if (c == '\t' || c == '\r' || c == '\n') c = ' ';
                if (c >= 32) b.Append(c);
            }
            return b.ToString().Trim();
        }

        static float Parse(string s)
        {
            float v;
            if (!float.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out v)) return 0f;
            return v;
        }

        static IEnumerable Enumerate(object list)
        {
            var empty = new object[0];
            if (list == null) return empty;
            MethodInfo get = list.GetType().GetMethod("GetEnumerator");
            if (get == null) return empty;
            object en = get.Invoke(list, null);
            if (en == null) return empty;
            MethodInfo move = en.GetType().GetMethod("MoveNext");
            PropertyInfo cur = en.GetType().GetProperty("Current");
            if (move == null || cur == null) return empty;
            var items = new List<object>();
            try
            {
                while ((bool)move.Invoke(en, null))
                    items.Add(cur.GetValue(en, null));
            }
            finally
            {
                IDisposable d = en as IDisposable;
                if (d != null) d.Dispose();
            }
            return items;
        }

        static string ReadText(string path, int cap)
        {
            try
            {
                using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    if (fs.Length <= 0 || fs.Length > cap) return null;
                    var buf = new byte[(int)fs.Length];
                    int n = fs.Read(buf, 0, buf.Length);
                    return Encoding.UTF8.GetString(buf, 0, n);
                }
            }
            catch
            {
                return null;
            }
        }

        static void Note(string s)
        {
            Last = s;
            if (Info != null) Info(s);
        }

        static void Fail(string s)
        {
            if (_fail == s) return;
            _fail = s;
            if (Error != null) Error(s);
        }
    }
}
