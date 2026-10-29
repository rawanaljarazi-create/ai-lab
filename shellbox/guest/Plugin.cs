using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text;
using BepInEx;
using BepInEx.Configuration;

namespace Shellbox
{
    [BepInPlugin("shellbox.bridge", "Shellbox", "0.1.0")]
    public class Plugin : BaseUnityPlugin
    {
        const int HeaderSize = 64;
        const int RecordSize = 48;
        const int MaxRecords = 48;
        const int FileSize = HeaderSize + RecordSize * MaxRecords;
        const int HitHeader = 16;
        const int HitRecord = 20;
        const int MaxHits = 32;

        ConfigEntry<string> _statePath;
        ConfigEntry<string> _hitsPath;
        FileStream _state;
        byte[] _buf;
        byte[] _hitBuf;
        uint _seq;
        uint _tick;
        int _sinceLog;
        bool _loggedScan;
        bool _runBackgroundSet;
        object _previousRunBackground;
        MethodInfo _find;
        object _findArg0;
        object _findArg1;
        Type _behaviourType;
        Type _objectType;
        MethodInfo _getComponent;
        Type _rigidbodyType;
        PropertyInfo _position;
        PropertyInfo _euler;
        PropertyInfo _mainCam;
        MethodInfo _getInstanceId;
        MethodInfo _destroy;
        readonly Dictionary<uint, Tracked> _live = new Dictionary<uint, Tracked>();
        readonly List<Ghost> _ghosts = new List<Ghost>();
        readonly HashSet<uint> _destroyed = new HashSet<uint>();
        readonly List<uint> _seen = new List<uint>();
        readonly List<object> _draw = new List<object>();
        string _fail;
        string _visualFail;
        string _spawnFail;

        struct Tracked
        {
            public object Behaviour;
            public byte Kind;
            public int Seen;
            public float X, Y, Z, Vx, Vy, Vz, Radius;
            public byte R, G, B;
        }

        struct Ghost
        {
            public uint Id;
            public byte Kind;
            public float X, Y, Z;
            public byte R, G, B;
            public int Left;
        }

        void Awake()
        {
            string data = @"C:\Program Files (x86)\Steam\steamapps\common\GarrysMod\garrysmod\data\shellbox";
            _statePath = Config.Bind("Bridge", "StatePath", Path.Combine(data, "state.bin"), "Snapshot the host reads.");
            _hitsPath = Config.Bind("Bridge", "HitsPath", Path.Combine(data, "hits.dat"), "Hits the host writes. Garry's Mod only allows .dat for this write.");
            _buf = new byte[FileSize];
            _hitBuf = new byte[HitHeader + HitRecord * MaxHits];
            Encoding.ASCII.GetBytes("FWGM").CopyTo(_buf, 0);
            PutU16(_buf, 4, 1);
            PutU16(_buf, 6, HeaderSize);
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_statePath.Value));
                _state = new FileStream(_statePath.Value, FileMode.Create, FileAccess.ReadWrite, FileShare.ReadWrite);
                _state.SetLength(FileSize);
                _state.Write(_buf, 0, FileSize);
                _state.Flush();
            }
            catch (Exception e)
            {
                Logger.LogError("state file: " + e.Message);
            }
            ShellboxVisual.Info = delegate (string s) { Logger.LogInfo(s); };
            ShellboxVisual.Error = delegate (string s) { Logger.LogError(s); };
            ShellboxSpawn.Info = delegate (string s) { Logger.LogInfo(s); };
            ShellboxSpawn.Error = delegate (string s) { Logger.LogError(s); };
            Logger.LogInfo("Shellbox awake. state=" + _statePath.Value);
        }

        void OnDestroy()
        {
            RestoreBackground();
            try { if (_state != null) _state.Dispose(); } catch { }
        }

        void Update()
        {
            try
            {
                EnsureUnity();
                SetBackground();
                if ((_tick % 10) == 0) Rescan();
                Publish();
                try
                {
                    if ((_tick % 2) == 0)
                    {
                        _draw.Clear();
                        for (int i = 0; i < _seen.Count && _draw.Count < 32; i++)
                        {
                            Tracked drawn;
                            if (_live.TryGetValue(_seen[i], out drawn) && drawn.Behaviour != null)
                                _draw.Add(drawn.Behaviour);
                        }
                        ShellboxVisual.Publish(_draw, _statePath.Value, _tick);
                    }
                }
                catch (Exception visualError)
                {
                    if (_visualFail != visualError.Message)
                    {
                        _visualFail = visualError.Message;
                        Logger.LogError("visual: " + visualError);
                    }
                }
                try
                {
                    ShellboxSpawn.Tick(_statePath.Value);
                }
                catch (Exception spawnError)
                {
                    if (_spawnFail != spawnError.Message)
                    {
                        _spawnFail = spawnError.Message;
                        Logger.LogError("spawn: " + spawnError);
                    }
                }
                ApplyHits();
                _sinceLog++;
                if (_sinceLog >= 120)
                {
                    _sinceLog = 0;
                    WriteHeartbeat();
                }
            }
            catch (Exception e)
            {
                if (_fail != e.Message)
                {
                    _fail = e.Message;
                    Logger.LogError("update: " + e);
                }
            }
        }

        void EnsureUnity()
        {
            if (_find != null) return;
            _objectType = Type.GetType("UnityEngine.Object, UnityEngine.CoreModule");
            _behaviourType = Type.GetType("UnityEngine.MonoBehaviour, UnityEngine.CoreModule");
            if (_objectType == null || _behaviourType == null) throw new Exception("UnityEngine.CoreModule is not loaded");
            foreach (MethodInfo m in _objectType.GetMethods(BindingFlags.Public | BindingFlags.Static))
            {
                if (m.Name == "FindObjectsByType" && m.IsGenericMethodDefinition && m.GetParameters().Length == 2)
                {
                    _find = m.MakeGenericMethod(_behaviourType);
                    ParameterInfo[] ps = m.GetParameters();
                    _findArg0 = Enum.ToObject(ps[0].ParameterType, 0);
                    _findArg1 = Enum.ToObject(ps[1].ParameterType, 0);
                    break;
                }
            }
            if (_find == null)
            {
                foreach (MethodInfo m in _objectType.GetMethods(BindingFlags.Public | BindingFlags.Static))
                {
                    if (m.Name == "FindObjectsOfType" && m.IsGenericMethodDefinition && m.GetParameters().Length == 0)
                    {
                        _find = m.MakeGenericMethod(_behaviourType);
                        break;
                    }
                }
            }
            if (_find == null) throw new Exception("no FindObjects method");
            _getInstanceId = _objectType.GetMethod("GetInstanceID");
            Type component = Type.GetType("UnityEngine.Component, UnityEngine.CoreModule");
            _getComponent = component.GetMethod("GetComponent", new[] { typeof(Type) });
            _rigidbodyType = Type.GetType("UnityEngine.Rigidbody, UnityEngine.PhysicsModule");
            Type transform = Type.GetType("UnityEngine.Transform, UnityEngine.CoreModule");
            _position = transform.GetProperty("position");
            _euler = transform.GetProperty("eulerAngles");
            Type camera = Type.GetType("UnityEngine.Camera, UnityEngine.CoreModule");
            _mainCam = camera.GetProperty("main", BindingFlags.Public | BindingFlags.Static);
            foreach (MethodInfo m in _objectType.GetMethods(BindingFlags.Public | BindingFlags.Static))
            {
                if (m.Name == "Destroy" && !m.IsGenericMethod)
                {
                    ParameterInfo[] ps = m.GetParameters();
                    if (ps.Length == 1)
                    {
                        _destroy = m;
                        break;
                    }
                }
            }
            if (!_loggedScan)
            {
                _loggedScan = true;
                Logger.LogInfo("scan method " + _find.Name);
            }
        }

        void SetBackground()
        {
            if (_runBackgroundSet) return;
            Type app = Type.GetType("UnityEngine.Application, UnityEngine.CoreModule");
            PropertyInfo prop = app.GetProperty("runInBackground", BindingFlags.Public | BindingFlags.Static);
            _previousRunBackground = prop.GetValue(null, null);
            prop.SetValue(null, true, null);
            _runBackgroundSet = true;
            Logger.LogInfo("runInBackground true (was " + _previousRunBackground + ")");
        }

        void RestoreBackground()
        {
            if (!_runBackgroundSet || _previousRunBackground == null) return;
            try
            {
                Type app = Type.GetType("UnityEngine.Application, UnityEngine.CoreModule");
                PropertyInfo prop = app.GetProperty("runInBackground", BindingFlags.Public | BindingFlags.Static);
                prop.SetValue(null, _previousRunBackground, null);
            }
            catch { }
        }

        void Rescan()
        {
            object raw = _findArg0 == null ? _find.Invoke(null, null) : _find.Invoke(null, new[] { _findArg0, _findArg1 });
            Array all = (Array)raw;
            var still = new HashSet<uint>();
            for (int i = 0; i < all.Length; i++)
            {
                object beh = all.GetValue(i);
                if (beh == null) continue;
                byte kind;
                uint id;
                try
                {
                    kind = KindOf(beh.GetType());
                    if (kind == 0) continue;
                    id = unchecked((uint)(int)_getInstanceId.Invoke(beh, null));
                }
                catch
                {
                    continue;
                }
                if (_destroyed.Contains(id)) continue;
                still.Add(id);
                Tracked t;
                if (!_live.TryGetValue(id, out t))
                {
                    t = new Tracked();
                    t.Kind = kind;
                    ColorOf(id, kind, out t.R, out t.G, out t.B);
                    t.Radius = kind == 3 ? 0.6f : 0.25f;
                }
                t.Behaviour = beh;
                t.Seen++;
                _live[id] = t;
            }
            var gone = new List<uint>();
            foreach (var pair in _live)
            {
                if (!still.Contains(pair.Key)) gone.Add(pair.Key);
            }
            for (int i = 0; i < gone.Count; i++)
            {
                Tracked t = _live[gone[i]];
                _live.Remove(gone[i]);
                if (t.Kind == 1)
                {
                    _ghosts.Add(new Ghost { Id = gone[i], Kind = t.Kind, X = t.X, Y = t.Y, Z = t.Z, R = t.R, G = t.G, B = t.B, Left = 12 });
                }
            }
        }

        void Publish()
        {
            _seen.Clear();
            var ids = new List<uint>(_live.Keys);
            float cx, cy, cz, yaw, pitch;
            bool cam = TryCamera(out cx, out cy, out cz, out yaw, out pitch);
            for (int i = 0; i < ids.Count; i++)
            {
                uint id = ids[i];
                Tracked t = _live[id];
                float x, y, z, vx, vy, vz;
                if (!TryPose(t.Behaviour, out x, out y, out z, out vx, out vy, out vz))
                {
                    _live.Remove(id);
                    continue;
                }
                t.X = x; t.Y = y; t.Z = z; t.Vx = vx; t.Vy = vy; t.Vz = vz;
                _live[id] = t;
                _seen.Add(id);
            }
            _seen.Sort(delegate (uint a, uint b)
            {
                Tracked ta = _live[a];
                Tracked tb = _live[b];
                float fa = ShellboxSpawn.FocusDistance(ta.X, ta.Y, ta.Z);
                float fb = ShellboxSpawn.FocusDistance(tb.X, tb.Y, tb.Z);
                bool na = fa < 8100f;
                bool nb = fb < 8100f;
                if (na != nb) return na ? -1 : 1;
                if (na) return fa.CompareTo(fb);
                float da = (ta.X - cx) * (ta.X - cx) + (ta.Y - cy) * (ta.Y - cy) + (ta.Z - cz) * (ta.Z - cz);
                float db = (tb.X - cx) * (tb.X - cx) + (tb.Y - cy) * (tb.Y - cy) + (tb.Z - cz) * (tb.Z - cz);
                return da.CompareTo(db);
            });
            _seq++;
            if ((_seq & 1) == 0) _seq++;
            PutU32(_buf, 8, _seq);
            WriteAt(8, 4);
            _state.Flush();

            _tick++;
            int written = 0;
            for (int i = 0; i < _seen.Count && written < MaxRecords; i++)
            {
                Tracked t = _live[_seen[i]];
                WriteRecord(HeaderSize + written * RecordSize, _seen[i], t.Kind, 0, t.R, t.G, t.B, t.X, t.Y, t.Z, t.Vx, t.Vy, t.Vz, t.Radius);
                written++;
            }
            for (int i = 0; i < _ghosts.Count && written < MaxRecords; i++)
            {
                Ghost g = _ghosts[i];
                if (g.Left <= 0) continue;
                WriteRecord(HeaderSize + written * RecordSize, g.Id, g.Kind, 1, g.R, g.G, g.B, g.X, g.Y, g.Z, 0, 0, 0, 1.5f);
                g.Left--;
                _ghosts[i] = g;
                written++;
            }
            PutU32(_buf, 12, _tick);
            PutU32(_buf, 16, unchecked((uint)Environment.TickCount));
            PutU16(_buf, 20, (ushort)written);
            PutU16(_buf, 22, (ushort)(cam ? 1 : 0));
            PutF32(_buf, 24, cx);
            PutF32(_buf, 28, cy);
            PutF32(_buf, 32, cz);
            PutF32(_buf, 36, yaw);
            PutF32(_buf, 40, pitch);
            for (int i = _ghosts.Count - 1; i >= 0; i--)
            {
                if (_ghosts[i].Left <= 0) _ghosts.RemoveAt(i);
            }
            WriteAt(12, FileSize - 12);
            _state.Flush();
            _seq++;
            PutU32(_buf, 8, _seq);
            WriteAt(8, 4);
            _state.Flush();
        }

        bool TryCamera(out float x, out float y, out float z, out float yaw, out float pitch)
        {
            x = y = z = yaw = pitch = 0;
            object cam = _mainCam.GetValue(null, null);
            if (cam == null) return false;
            object transform = cam.GetType().GetProperty("transform").GetValue(cam, null);
            object pos = _position.GetValue(transform, null);
            object eul = _euler.GetValue(transform, null);
            x = Field(pos, "x"); y = Field(pos, "y"); z = Field(pos, "z");
            pitch = Field(eul, "x"); yaw = Field(eul, "y");
            return true;
        }

        bool TryPose(object beh, out float x, out float y, out float z, out float vx, out float vy, out float vz)
        {
            x = y = z = vx = vy = vz = 0;
            try
            {
                object transform = beh.GetType().GetProperty("transform").GetValue(beh, null);
                if (transform == null) return false;
                object pos = _position.GetValue(transform, null);
                x = Field(pos, "x"); y = Field(pos, "y"); z = Field(pos, "z");
                if (_rigidbodyType != null && _getComponent != null)
                {
                    object rb = _getComponent.Invoke(beh, new object[] { _rigidbodyType });
                    if (rb == null)
                    {
                        object go = beh.GetType().GetProperty("gameObject").GetValue(beh, null);
                        MethodInfo get = go.GetType().GetMethod("GetComponent", new[] { typeof(Type) });
                        if (get != null) rb = get.Invoke(go, new object[] { _rigidbodyType });
                    }
                    if (rb != null)
                    {
                        PropertyInfo vel = rb.GetType().GetProperty("linearVelocity") ?? rb.GetType().GetProperty("velocity");
                        if (vel != null)
                        {
                            object v = vel.GetValue(rb, null);
                            vx = Field(v, "x"); vy = Field(v, "y"); vz = Field(v, "z");
                        }
                    }
                }
                return true;
            }
            catch
            {
                return false;
            }
        }

        void ApplyHits()
        {
            if (!File.Exists(_hitsPath.Value) || _destroy == null) return;
            int n;
            try
            {
                using (var fs = new FileStream(_hitsPath.Value, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    n = fs.Read(_hitBuf, 0, _hitBuf.Length);
                }
            }
            catch { return; }
            if (n < HitHeader) return;
            if (_hitBuf[0] != (byte)'F' || _hitBuf[1] != (byte)'W' || _hitBuf[2] != (byte)'H' || _hitBuf[3] != (byte)'T') return;
            int count = GetU16(_hitBuf, 12);
            if (count < 0 || count > MaxHits) return;
            for (int i = 0; i < count; i++)
            {
                int o = HitHeader + i * HitRecord;
                if (o + 4 > n) break;
                uint id = GetU32(_hitBuf, o);
                Tracked t;
                if (!_live.TryGetValue(id, out t)) continue;
                if (t.Kind != 1) continue;
                if (_destroyed.Contains(id)) continue;
                if (o + 20 > n) break;
                float hx = BitConverter.ToSingle(_hitBuf, o + 8);
                float hy = BitConverter.ToSingle(_hitBuf, o + 12);
                float hz = BitConverter.ToSingle(_hitBuf, o + 16);
                if (ShellboxSpawn.Halt(t.Behaviour, hx, hy, hz))
                    _destroyed.Add(id);
            }
        }

        void WriteHeartbeat()
        {
            float x, y, z, yaw, pitch;
            bool cam = TryCamera(out x, out y, out z, out yaw, out pitch);
            string line = "seq=" + _seq + " tick=" + _tick + " camx=" + x.ToString("0.000") + " camy=" + y.ToString("0.000") + " camz=" + z.ToString("0.000") + " yaw=" + yaw.ToString("0.0") + " count=" + _live.Count + " cam=" + (cam ? 1 : 0) + " meshes=" + ShellboxVisual.MeshCount + " particles=" + ShellboxVisual.ParticleCount + " catalog=" + ShellboxSpawn.Count + " last=" + ShellboxSpawn.Last;
            Logger.LogInfo(line);
            try
            {
                string path = Path.Combine(Path.GetDirectoryName(_statePath.Value), "guest.log");
                File.WriteAllText(path, line + "\n");
            }
            catch { }
        }

        static byte KindOf(Type t)
        {
            string full = t.FullName ?? "";
            if (full.IndexOf(".Behaviors.Fireworks.", StringComparison.Ordinal) < 0) return 0;
            if (full.IndexOf(".Fireworks.Parts.", StringComparison.Ordinal) >= 0) return 0;
            string n = t.Name;
            if (n == "BaseFireworkBehavior" || !n.EndsWith("Behavior")) return 0;
            // Tubes and cakes stay where the HUD placed them. Shells and shots can hit the map.
            if (n == "FountainBehavior" || n == "MortarBehavior" || n == "CakeBehavior" || n == "RomanCandleBehavior" || n == "PreloadedTubeBehavior")
                return 8;
            return 1;
        }

        static void ColorOf(uint id, byte kind, out byte r, out byte g, out byte b)
        {
            r = (byte)(160 + (id * 40) % 95);
            g = (byte)(30 + (id * 17) % 180);
            b = (byte)(20 + (id * 29) % 120);
            if (kind == 8) { r = 255; g = 170; b = 40; }
        }

        static float Field(object boxed, string name)
        {
            return (float)boxed.GetType().GetField(name).GetValue(boxed);
        }

        void WriteRecord(int o, uint id, byte kind, byte state, byte r, byte g, byte b, float x, float y, float z, float vx, float vy, float vz, float radius)
        {
            PutU32(_buf, o, id);
            _buf[o + 4] = kind;
            _buf[o + 5] = state;
            _buf[o + 6] = r;
            _buf[o + 7] = g;
            _buf[o + 8] = b;
            PutF32(_buf, o + 12, x);
            PutF32(_buf, o + 16, y);
            PutF32(_buf, o + 20, z);
            PutF32(_buf, o + 24, vx);
            PutF32(_buf, o + 28, vy);
            PutF32(_buf, o + 32, vz);
            PutF32(_buf, o + 36, radius);
        }

        void WriteAt(int offset, int count)
        {
            if (_state == null) return;
            _state.Position = offset;
            _state.Write(_buf, offset, count);
        }

        static void PutU16(byte[] b, int o, ushort v)
        {
            b[o] = (byte)v;
            b[o + 1] = (byte)(v >> 8);
        }

        static void PutU32(byte[] b, int o, uint v)
        {
            b[o] = (byte)v;
            b[o + 1] = (byte)(v >> 8);
            b[o + 2] = (byte)(v >> 16);
            b[o + 3] = (byte)(v >> 24);
        }

        static void PutF32(byte[] b, int o, float v)
        {
            byte[] bits = BitConverter.GetBytes(v);
            Buffer.BlockCopy(bits, 0, b, o, 4);
        }

        static ushort GetU16(byte[] b, int o)
        {
            return (ushort)(b[o] | (b[o + 1] << 8));
        }

        static uint GetU32(byte[] b, int o)
        {
            return (uint)(b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24));
        }
    }
}
