using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;

namespace Shellbox
{
    static class U
    {
        static readonly Dictionary<string, Type> _types = new Dictionary<string, Type>();
        static MethodInfo _findByType;
        static object _findA;
        static object _findB;
        static object _findInactive;
        static bool _findReady;

        public static Type Find(string full)
        {
            Type t;
            if (_types.TryGetValue(full, out t)) return t;
            t = Type.GetType(full);
            if (t == null)
            {
                string name = full.Split(',')[0].Trim();
                Assembly[] asms = AppDomain.CurrentDomain.GetAssemblies();
                for (int i = 0; i < asms.Length && t == null; i++)
                    t = asms[i].GetType(name);
            }
            _types[full] = t;
            return t;
        }

        public static Array FindObjects(Type type)
        {
            return FindObjects(type, false);
        }

        public static Array FindObjects(Type type, bool inactive)
        {
            if (type == null) return Array.CreateInstance(typeof(object), 0);
            EnsureFind();
            if (_findByType == null) return Array.CreateInstance(type, 0);
            MethodInfo made = _findByType.MakeGenericMethod(type);
            object which = inactive && _findInactive != null ? _findInactive : _findB;
            object raw = _findA == null ? made.Invoke(null, null) : made.Invoke(null, new[] { _findA, which });
            return (Array)raw;
        }

        static void EnsureFind()
        {
            if (_findReady) return;
            _findReady = true;
            Type obj = Find("UnityEngine.Object");
            if (obj == null) return;
            foreach (MethodInfo m in obj.GetMethods(BindingFlags.Public | BindingFlags.Static))
            {
                if (!m.IsGenericMethodDefinition) continue;
                ParameterInfo[] ps = m.GetParameters();
                if (m.Name == "FindObjectsByType" && ps.Length == 2)
                {
                    _findByType = m;
                    _findA = Enum.ToObject(ps[0].ParameterType, 0);
                    _findB = Enum.ToObject(ps[1].ParameterType, 0);
                    _findInactive = Enum.ToObject(ps[1].ParameterType, 1);
                    return;
                }
            }
            foreach (MethodInfo m in obj.GetMethods(BindingFlags.Public | BindingFlags.Static))
            {
                if (m.Name == "FindObjectsOfType" && m.IsGenericMethodDefinition && m.GetParameters().Length == 0)
                {
                    _findByType = m;
                    return;
                }
            }
        }

        public static object Get(object o, string prop)
        {
            if (o == null) return null;
            PropertyInfo p = o.GetType().GetProperty(prop, BindingFlags.Public | BindingFlags.Instance);
            if (p == null) return null;
            return p.GetValue(o, null);
        }

        public static object Field(object o, string name)
        {
            if (o == null) return null;
            FieldInfo f = o.GetType().GetField(name, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
            if (f == null) return null;
            return f.GetValue(o);
        }

        public static float Num(object o, string name)
        {
            object v = Field(o, name);
            if (v == null) v = Get(o, name);
            if (v == null) return 0;
            return Convert.ToSingle(v);
        }

        public static byte Chan(object c, string name)
        {
            if (c == null) return 255;
            object raw = Field(c, name);
            if (raw == null) raw = Get(c, name);
            if (raw == null) return 255;
            if (raw is byte) return (byte)raw;
            float f = Convert.ToSingle(raw);
            if (f < 0) f = 0;
            if (f <= 1.01f) return (byte)(f * 255f);
            if (f > 255f) f = 255f;
            return (byte)f;
        }

        public static bool Alive(object o)
        {
            if (o == null) return false;
            try
            {
                string text = o.ToString();
                return text != "null";
            }
            catch
            {
                return false;
            }
        }

        public static bool Active(object o)
        {
            if (!Alive(o)) return false;
            try
            {
                object v = Get(o, "activeInHierarchy");
                if (v is bool) return (bool)v;
                object go = Get(o, "gameObject");
                if (go == null) return true;
                v = Get(go, "activeInHierarchy");
                return v is bool && (bool)v;
            }
            catch
            {
                return false;
            }
        }

        public static object Transform(object o)
        {
            return Get(o, "transform");
        }

        public static uint Id(object o)
        {
            if (o == null) return 0;
            MethodInfo m = o.GetType().GetMethod("GetInstanceID");
            if (m == null) return 0;
            return unchecked((uint)(int)m.Invoke(o, null));
        }

        public static Array Components(object o, Type type)
        {
            if (o == null || type == null) return Array.CreateInstance(typeof(object), 0);
            MethodInfo found = null;
            foreach (MethodInfo m in o.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance))
            {
                if (m.Name != "GetComponentsInChildren" || m.IsGenericMethod) continue;
                ParameterInfo[] ps = m.GetParameters();
                if (ps.Length == 2 && ps[0].ParameterType == typeof(Type) && ps[1].ParameterType == typeof(bool))
                {
                    found = m;
                    break;
                }
            }
            if (found == null) return Array.CreateInstance(type, 0);
            object raw = found.Invoke(o, new object[] { type, false });
            return (Array)raw;
        }

        public static void Destroy(object o)
        {
            if (o == null) return;
            Type obj = Find("UnityEngine.Object");
            if (obj == null) return;
            foreach (MethodInfo m in obj.GetMethods(BindingFlags.Public | BindingFlags.Static))
            {
                if (m.Name == "Destroy" && !m.IsGenericMethod && m.GetParameters().Length == 1)
                {
                    m.Invoke(null, new[] { o });
                    return;
                }
            }
        }
    }

    class Geo
    {
        public float[] Xyzuv;
        public byte[] Col;
        public int[] Tris;
        public int N;
        public int T;
    }

    static class ShellboxVisual
    {
        public const int MaxMesh = 24;
        public const int MaxVerts = 4000;
        public const int MaxTris = 3000;
        public const int MaxParts = 1000;
        public const int Header = 64;
        public const int MeshStride = 24;
        public const int VertStride = 24;
        public const int TriStride = 6;
        public const int PartStride = 20;
        public const int MeshAt = Header;
        public const int VertAt = MeshAt + MaxMesh * MeshStride;
        public const int TriAt = VertAt + MaxVerts * VertStride;
        public const int PartAt = TriAt + MaxTris * TriStride;
        public const int FileSize = PartAt + MaxParts * PartStride;

        public static Action<string> Info;
        public static Action<string> Error;
        public static int MeshCount;
        public static int ParticleCount;
        public static int TextureCount;

        static FileStream _file;
        static byte[] _buf;
        static uint _seq;
        static string _fail;
        static bool _logged;
        static Array _looseCache;
        static int _looseFrame;
        static readonly Dictionary<int, Geo> _geo = new Dictionary<int, Geo>();
        static readonly Dictionary<int, uint> _tex = new Dictionary<int, uint>();
        static readonly List<object> _extra = new List<object>();
        static readonly List<uint> _partSeen = new List<uint>();
        static uint _extraTick;
        static int _texBudget;
        static int _gpuBudget;
        static bool _defer;
        static bool _readLogged;
        static Type _meshFilter;
        static Type _meshRenderer;
        static Type _particle;
        static Type _particleStruct;
        static Type _trail;
        static Type _line;
        static MethodInfo _getParticles;
        static Array _partBuf;
        static bool _typesReady;

        public static void Publish(IList<object> behaviours, string statePath, uint tick)
        {
            try
            {
                Ensure(statePath);
                EnsureTypes();
                if ((tick - _extraTick) >= 30 || _extraTick == 0)
                {
                    _extraTick = tick;
                    RefreshExtras();
                }
                _texBudget = 1;
                _gpuBudget = 2;
                int verts = 0;
                int tris = 0;
                int meshes = 0;
                int parts = 0;
                _partSeen.Clear();
                Array.Clear(_buf, Header, FileSize - Header);

                var roots = new List<object>();
                if (behaviours != null)
                {
                    for (int i = 0; i < behaviours.Count; i++) roots.Add(behaviours[i]);
                }
                for (int i = 0; i < _extra.Count; i++) roots.Add(_extra[i]);

                for (int i = 0; i < roots.Count; i++)
                {
                    object root = roots[i];
                    if (!U.Active(root)) continue;
                    object tr = U.Transform(root);
                    if (tr == null) continue;
                    CollectMeshes(tr, true, ref meshes, ref verts, ref tris);
                    object parent = U.Get(tr, "parent");
                    if (parent != null)
                    {
                        CollectMeshes(parent, false, ref meshes, ref verts, ref tris);
                        object up = U.Get(parent, "parent");
                        if (up != null) CollectMeshes(up, false, ref meshes, ref verts, ref tris);
                    }
                    _maxDist = 0f;
                    parts = CollectParticles(tr, parts);
                }
                parts = CollectLoose(parts);

                _seq++;
                if ((_seq & 1) == 0) _seq++;
                PutU32(8, _seq);
                WriteAt(8, 4);
                _file.Flush();

                PutU32(12, tick);
                PutU16(16, (ushort)meshes);
                PutU16(18, (ushort)parts);
                PutU32(20, (uint)verts);
                PutU32(24, (uint)tris);
                WriteAt(12, FileSize - 12);
                _file.Flush();
                _seq++;
                PutU32(8, _seq);
                WriteAt(8, 4);
                _file.Flush();
                MeshCount = meshes;
                ParticleCount = parts;
                if (!_logged && (meshes > 0 || parts > 0))
                {
                    _logged = true;
                    if (Info != null) Info("visual meshes=" + meshes + " particles=" + parts + " textures=" + TextureCount);
                }
            }
            catch (Exception e)
            {
                if (_fail != e.Message)
                {
                    _fail = e.Message;
                    if (Error != null) Error("visual: " + e);
                }
            }
        }

        static void Ensure(string statePath)
        {
            if (_file != null) return;
            _buf = new byte[FileSize];
            Encoding.ASCII.GetBytes("FWGE").CopyTo(_buf, 0);
            PutU16(4, 1);
            PutU16(6, Header);
            string dir = Path.GetDirectoryName(statePath);
            Directory.CreateDirectory(dir);
            _file = new FileStream(Path.Combine(dir, "geom.bin"), FileMode.Create, FileAccess.ReadWrite, FileShare.ReadWrite);
            _file.SetLength(FileSize);
            _file.Write(_buf, 0, FileSize);
            _file.Flush();
        }

        static void EnsureTypes()
        {
            if (_typesReady) return;
            _typesReady = true;
            _meshFilter = U.Find("UnityEngine.MeshFilter");
            _meshRenderer = U.Find("UnityEngine.MeshRenderer");
            _particle = U.Find("UnityEngine.ParticleSystem");
            if (_particle != null) _particleStruct = _particle.GetNestedType("Particle", BindingFlags.Public | BindingFlags.NonPublic);
            _trail = U.Find("UnityEngine.TrailRenderer");
            _line = U.Find("UnityEngine.LineRenderer");
            if (_particle != null)
            {
                foreach (MethodInfo m in _particle.GetMethods(BindingFlags.Public | BindingFlags.Instance))
                {
                    if (m.Name != "GetParticles") continue;
                    ParameterInfo[] ps = m.GetParameters();
                    Type pt = ps[0].ParameterType;
                    if (pt.IsByRef) pt = pt.GetElementType();
                    if (ps.Length == 2 && pt.IsArray && ps[1].ParameterType == typeof(int))
                    {
                        _getParticles = m;
                        break;
                    }
                }
                if (_getParticles != null)
                {
                    Type arr = _getParticles.GetParameters()[0].ParameterType;
                    if (arr.IsByRef) arr = arr.GetElementType();
                    _partBuf = Array.CreateInstance(arr.GetElementType(), 160);
                }
                else if (_particleStruct != null)
                    _partBuf = Array.CreateInstance(_particleStruct, 160);
            }
            if (Info != null)
                Info("visual types mesh=" + (_meshFilter != null) + " particle=" + (_particle != null) + " get=" + (_getParticles != null));
        }

        static void RefreshExtras()
        {
            _extra.Clear();
            Type tool = U.Find("FireworksMania.Interactions.Tools.SpawnTool");
            if (tool == null) return;
            Array all = U.FindObjects(tool);
            FieldInfo ph = tool.GetField("_itemToSpawnPlaceholder", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (ph == null || all == null) return;
            for (int i = 0; i < all.Length; i++)
            {
                object go = ph.GetValue(all.GetValue(i));
                if (go != null && U.Active(go)) _extra.Add(go);
            }
        }

        static void CollectMeshes(object tr, bool children, ref int meshes, ref int verts, ref int tris)
        {
            if (_meshFilter == null || meshes >= MaxMesh || verts >= MaxVerts || tris >= MaxTris) return;
            Array filters = children ? U.Components(tr, _meshFilter) : SelfComponent(tr, _meshFilter);
            for (int i = 0; i < filters.Length; i++)
            {
                if (meshes >= MaxMesh || verts >= MaxVerts || tris >= MaxTris) return;
                object filter = filters.GetValue(i);
                if (filter == null || !U.Active(filter)) continue;
                object renderer = null;
                if (_meshRenderer != null)
                {
                    object go = U.Get(filter, "gameObject");
                    if (go != null)
                    {
                        MethodInfo get = go.GetType().GetMethod("GetComponent", new[] { typeof(Type) });
                        if (get != null) renderer = get.Invoke(go, new object[] { _meshRenderer });
                    }
                }
                if (renderer != null)
                {
                    object en = U.Get(renderer, "enabled");
                    if (en is bool && !(bool)en) continue;
                    if (Huge(renderer)) continue;
                }
                object mesh = U.Get(filter, "sharedMesh");
                if (mesh == null) continue;
                int meshId = (int)(uint)U.Id(mesh);
                Geo geo;
                if (!_geo.TryGetValue(meshId, out geo))
                {
                    _defer = false;
                    geo = BuildGeo(mesh);
                    if (!_defer) _geo[meshId] = geo;
                }
                if (geo == null || geo.N < 3 || geo.T < 1) continue;
                int useV = geo.N;
                int useT = geo.T;
                if (verts + useV > MaxVerts || tris + useT > MaxTris) continue;
                object filterTr = U.Transform(filter);
                float m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23;
                if (!Matrix(filterTr, out m00, out m01, out m02, out m03, out m10, out m11, out m12, out m13, out m20, out m21, out m22, out m23))
                    continue;
                uint tex = 0;
                byte cr = 220, cg = 200, cb = 180, ca = 255;
                if (renderer != null)
                {
                    object mat = U.Get(renderer, "sharedMaterial");
                    tex = TextureKey(mat);
                    if (tex == 0) MaterialColor(mat, ref cr, ref cg, ref cb, ref ca);
                }
                int o = MeshAt + meshes * MeshStride;
                PutU32(o, U.Id(filter));
                PutU32(o + 4, (uint)verts);
                PutU32(o + 8, (uint)tris);
                PutU16(o + 12, (ushort)useV);
                PutU16(o + 14, (ushort)useT);
                PutU32(o + 16, tex);
                for (int v = 0; v < useV; v++)
                {
                    int s = v * 5;
                    float x = geo.Xyzuv[s];
                    float y = geo.Xyzuv[s + 1];
                    float z = geo.Xyzuv[s + 2];
                    float wx = m00 * x + m01 * y + m02 * z + m03;
                    float wy = m10 * x + m11 * y + m12 * z + m13;
                    float wz = m20 * x + m21 * y + m22 * z + m23;
                    int vo = VertAt + (verts + v) * VertStride;
                    PutF(vo, wx);
                    PutF(vo + 4, wy);
                    PutF(vo + 8, wz);
                    PutF(vo + 12, geo.Xyzuv[s + 3]);
                    PutF(vo + 16, geo.Xyzuv[s + 4]);
                    if (geo.Col != null)
                    {
                        _buf[vo + 20] = geo.Col[v * 4];
                        _buf[vo + 21] = geo.Col[v * 4 + 1];
                        _buf[vo + 22] = geo.Col[v * 4 + 2];
                        _buf[vo + 23] = geo.Col[v * 4 + 3];
                    }
                    else if (tex != 0)
                    {
                        _buf[vo + 20] = 255;
                        _buf[vo + 21] = 255;
                        _buf[vo + 22] = 255;
                        _buf[vo + 23] = 255;
                    }
                    else
                    {
                        _buf[vo + 20] = cr;
                        _buf[vo + 21] = cg;
                        _buf[vo + 22] = cb;
                        _buf[vo + 23] = ca;
                    }
                }
                for (int t = 0; t < useT; t++)
                {
                    int to = TriAt + (tris + t) * TriStride;
                    PutU16(to, (ushort)(verts + geo.Tris[t * 3]));
                    PutU16(to + 2, (ushort)(verts + geo.Tris[t * 3 + 1]));
                    PutU16(to + 4, (ushort)(verts + geo.Tris[t * 3 + 2]));
                }
                verts += useV;
                tris += useT;
                meshes++;
            }
        }

        static Array SelfComponent(object tr, Type type)
        {
            object go = U.Get(tr, "gameObject");
            if (go == null) return Array.CreateInstance(type, 0);
            MethodInfo get = go.GetType().GetMethod("GetComponent", new[] { typeof(Type) });
            if (get == null) return Array.CreateInstance(type, 0);
            object c = get.Invoke(go, new object[] { type });
            Array a = Array.CreateInstance(type, c == null ? 0 : 1);
            if (c != null) a.SetValue(c, 0);
            return a;
        }

        static bool Huge(object renderer)
        {
            object b = U.Get(renderer, "bounds");
            if (b == null) return false;
            object size = U.Get(b, "size");
            if (size == null) return false;
            float x = Math.Abs(U.Num(size, "x"));
            float y = Math.Abs(U.Num(size, "y"));
            float z = Math.Abs(U.Num(size, "z"));
            return x > 30f || y > 30f || z > 30f;
        }

        static int MapVert(Dictionary<int, int> used, List<int> remap, int src)
        {
            int dst;
            if (!used.TryGetValue(src, out dst))
            {
                dst = remap.Count;
                used[src] = dst;
                remap.Add(src);
            }
            return dst;
        }

        static int Attr(object mesh, string method, string name)
        {
            Type en = U.Find("UnityEngine.Rendering.VertexAttribute");
            if (en == null) return -1;
            object attr = Enum.Parse(en, name);
            MethodInfo m = mesh.GetType().GetMethod(method);
            if (m == null) return -1;
            return Convert.ToInt32(m.Invoke(mesh, new[] { attr }));
        }

        static void DisposeBuf(object buf)
        {
            if (buf == null) return;
            MethodInfo m = buf.GetType().GetMethod("Dispose");
            if (m != null && m.GetParameters().Length == 0)
            {
                try { m.Invoke(buf, null); } catch { }
            }
        }

        static byte[] ReadBuffer(object gb)
        {
            int count = Convert.ToInt32(U.Get(gb, "count"));
            int stride = Convert.ToInt32(U.Get(gb, "stride"));
            if (count <= 0 || stride <= 0 || count > 300000) return null;
            int bytes = count * stride;
            byte[] raw = new byte[bytes];
            MethodInfo getData = null;
            foreach (MethodInfo m in gb.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance))
            {
                if (m.Name == "GetData" && m.GetParameters().Length == 1 && m.GetParameters()[0].ParameterType == typeof(Array))
                {
                    getData = m;
                    break;
                }
            }
            if (getData != null)
            {
                try
                {
                    getData.Invoke(gb, new object[] { raw });
                    return raw;
                }
                catch (Exception e)
                {
                    Exception inner = e.InnerException == null ? e : e.InnerException;
                    if (Info != null && !_readLogged)
                    {
                        _readLogged = true;
                        Info("buffer GetData " + inner.GetType().Name + " " + inner.Message);
                    }
                }
            }
            Type asyncType = U.Find("UnityEngine.Rendering.AsyncGPUReadback");
            if (asyncType == null) return null;
            MethodInfo request = null;
            foreach (MethodInfo m in asyncType.GetMethods(BindingFlags.Public | BindingFlags.Static))
            {
                if (m.Name != "Request") continue;
                ParameterInfo[] ps = m.GetParameters();
                if (ps.Length == 2 && ps[0].ParameterType.Name == "GraphicsBuffer")
                {
                    request = m;
                    break;
                }
            }
            if (request == null) return null;
            object req = request.Invoke(null, new object[] { gb, null });
            MethodInfo wait = req.GetType().GetMethod("WaitForCompletion");
            if (wait != null) wait.Invoke(req, null);
            object err = U.Get(req, "hasError");
            if (err is bool && (bool)err) return null;
            object sizeObj = U.Get(req, "layerDataSize");
            int size = sizeObj == null ? bytes : Convert.ToInt32(sizeObj);
            if (size <= 0 || size > raw.Length) return null;
            MethodInfo rawM = req.GetType().GetMethod("GetDataRaw");
            IntPtr ptr = (IntPtr)rawM.Invoke(req, new object[] { 0 });
            if (ptr == IntPtr.Zero) return null;
            if (size != raw.Length) raw = new byte[size];
            Marshal.Copy(ptr, raw, 0, size);
            return raw;
        }

        static float HalfFloat(byte[] b, int o)
        {
            int h = b[o] | (b[o + 1] << 8);
            int sign = (h >> 15) & 1;
            int exp = (h >> 10) & 31;
            int frac = h & 1023;
            float mag;
            if (exp == 0) mag = (float)Math.Pow(2, -14) * (frac / 1024f);
            else if (exp == 31) mag = float.NaN;
            else mag = (float)Math.Pow(2, exp - 15) * (1f + frac / 1024f);
            return sign == 1 ? -mag : mag;
        }

        static float ReadFloat(byte[] b, int o, int format)
        {
            if (format == 1) return HalfFloat(b, o);
            return BitConverter.ToSingle(b, o);
        }

        static int ReadIndex(byte[] b, int stride, int i)
        {
            int o = i * stride;
            if (o + 2 > b.Length) return -1;
            if (stride == 4)
            {
                if (o + 4 > b.Length) return -1;
                return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
            }
            return b[o] | (b[o + 1] << 8);
        }

        static Geo BuildFromGpu(object mesh)
        {
            if (_gpuBudget <= 0)
            {
                _defer = true;
                return null;
            }
            object vb = null;
            object ib = null;
            try
            {
                _gpuBudget--;
                object countObj = U.Get(mesh, "vertexCount");
                int vertCount = countObj == null ? 0 : Convert.ToInt32(countObj);
                if (vertCount < 3) return null;
                MethodInfo getVb = mesh.GetType().GetMethod("GetVertexBuffer", new[] { typeof(int) });
                MethodInfo getIb = mesh.GetType().GetMethod("GetIndexBuffer", Type.EmptyTypes);
                if (getVb == null || getIb == null) return null;
                vb = getVb.Invoke(mesh, new object[] { 0 });
                ib = getIb.Invoke(mesh, null);
                if (vb == null || ib == null) return null;
                byte[] vraw = ReadBuffer(vb);
                byte[] iraw = ReadBuffer(ib);
                if (vraw == null || iraw == null) return null;
                int stride = Convert.ToInt32(U.Get(vb, "stride"));
                int posOff = Attr(mesh, "GetVertexAttributeOffset", "Position");
                int posDim = Attr(mesh, "GetVertexAttributeDimension", "Position");
                int posFmt = Attr(mesh, "GetVertexAttributeFormat", "Position");
                if (stride < 12 || posOff < 0 || posDim < 3 || posFmt != 0)
                {
                    if (Info != null) Info("mesh layout stride=" + stride + " off=" + posOff + " dim=" + posDim + " fmt=" + posFmt);
                    return null;
                }
                int uvOff = Attr(mesh, "GetVertexAttributeOffset", "TexCoord0");
                int uvDim = Attr(mesh, "GetVertexAttributeDimension", "TexCoord0");
                int uvFmt = Attr(mesh, "GetVertexAttributeFormat", "TexCoord0");
                int uvStream = Attr(mesh, "GetVertexAttributeStream", "TexCoord0");
                bool hasUv = uvStream == 0 && uvOff >= 0 && uvDim >= 2 && (uvFmt == 0 || uvFmt == 1);
                int uvStep = uvFmt == 1 ? 2 : 4;
                int indexStride = Convert.ToInt32(U.Get(ib, "stride"));
                if (indexStride != 2 && indexStride != 4) indexStride = 2;
                int indexCount = iraw.Length / indexStride;
                int triCount = indexCount / 3;
                if (triCount < 1) return null;
                int step = Math.Max(1, triCount / 800);
                var tris = new List<int>();
                for (int t = 0; t < triCount && tris.Count / 3 < 800; t += step)
                {
                    int a = ReadIndex(iraw, indexStride, t * 3);
                    int b = ReadIndex(iraw, indexStride, t * 3 + 1);
                    int c = ReadIndex(iraw, indexStride, t * 3 + 2);
                    if (a < 0 || b < 0 || c < 0 || a >= vertCount || b >= vertCount || c >= vertCount) continue;
                    tris.Add(a);
                    tris.Add(b);
                    tris.Add(c);
                }
                if (tris.Count < 3) return null;
                var used = new Dictionary<int, int>();
                var remap = new List<int>();
                int kept = 0;
                for (int i = 0; i + 2 < tris.Count; i += 3)
                {
                    int a = tris[i];
                    int b = tris[i + 1];
                    int c = tris[i + 2];
                    int need = 0;
                    if (!used.ContainsKey(a)) need++;
                    if (!used.ContainsKey(b) && b != a) need++;
                    if (!used.ContainsKey(c) && c != a && c != b) need++;
                    if (remap.Count + need > 2000) break;
                    tris[kept++] = MapVert(used, remap, a);
                    tris[kept++] = MapVert(used, remap, b);
                    tris[kept++] = MapVert(used, remap, c);
                }
                if (kept < 3) return null;
                if (kept < tris.Count) tris.RemoveRange(kept, tris.Count - kept);
                var geo = new Geo();
                geo.N = remap.Count;
                geo.T = tris.Count / 3;
                geo.Tris = tris.ToArray();
                geo.Xyzuv = new float[geo.N * 5];
                for (int i = 0; i < geo.N; i++)
                {
                    int src = remap[i];
                    int o = src * stride + posOff;
                    if (o + 12 > vraw.Length) return null;
                    int d = i * 5;
                    geo.Xyzuv[d] = BitConverter.ToSingle(vraw, o);
                    geo.Xyzuv[d + 1] = BitConverter.ToSingle(vraw, o + 4);
                    geo.Xyzuv[d + 2] = BitConverter.ToSingle(vraw, o + 8);
                    float tu = 0, tv = 0;
                    if (hasUv)
                    {
                        int uo = src * stride + uvOff;
                        if (uo + uvStep * 2 <= vraw.Length)
                        {
                            tu = ReadFloat(vraw, uo, uvFmt);
                            tv = 1f - ReadFloat(vraw, uo + uvStep, uvFmt);
                        }
                    }
                    geo.Xyzuv[d + 3] = tu;
                    geo.Xyzuv[d + 4] = tv;
                }
                if (Info != null) Info("gpu mesh " + U.Get(mesh, "name") + " verts=" + geo.N + " tris=" + geo.T);
                return geo;
            }
            catch (Exception e)
            {
                Exception inner = e.InnerException == null ? e : e.InnerException;
                if (Info != null) Info("gpu mesh failed " + inner.GetType().Name + " " + inner.Message);
                return null;
            }
            finally
            {
                DisposeBuf(vb);
                DisposeBuf(ib);
            }
        }

        static Geo BuildGeo(object mesh)
        {
            try
            {
                Array vertices = U.Get(mesh, "vertices") as Array;
                if (vertices == null || vertices.Length < 3)
                    return BuildFromGpu(mesh);
                Array uv = U.Get(mesh, "uv") as Array;
                Array colors = U.Get(mesh, "colors32") as Array;
                int sub = 1;
                object subCount = U.Get(mesh, "subMeshCount");
                if (subCount != null) sub = Math.Max(1, Convert.ToInt32(subCount));
                var tris = new List<int>();
                MethodInfo getTris = null;
                foreach (MethodInfo m in mesh.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance))
                {
                    if (m.Name == "GetTriangles" && m.GetParameters().Length == 1 && m.GetParameters()[0].ParameterType == typeof(int))
                    {
                        getTris = m;
                        break;
                    }
                }
                for (int s = 0; s < sub; s++)
                {
                    Array idx = null;
                    if (getTris != null) idx = getTris.Invoke(mesh, new object[] { s }) as Array;
                    else if (s == 0) idx = U.Get(mesh, "triangles") as Array;
                    if (idx == null) continue;
                    int n = idx.Length / 3;
                    int stride = Math.Max(1, n / 800);
                    for (int t = 0; t < n && tris.Count / 3 < 800; t += stride)
                    {
                        int a = Convert.ToInt32(idx.GetValue(t * 3));
                        int b = Convert.ToInt32(idx.GetValue(t * 3 + 1));
                        int c = Convert.ToInt32(idx.GetValue(t * 3 + 2));
                        if (a < 0 || b < 0 || c < 0 || a >= vertices.Length || b >= vertices.Length || c >= vertices.Length) continue;
                        tris.Add(a);
                        tris.Add(b);
                        tris.Add(c);
                    }
                }
                if (tris.Count < 3) return null;
                var used = new Dictionary<int, int>();
                var remap = new List<int>();
                int kept = 0;
                for (int i = 0; i + 2 < tris.Count; i += 3)
                {
                    int a = tris[i];
                    int b = tris[i + 1];
                    int c = tris[i + 2];
                    int need = 0;
                    if (!used.ContainsKey(a)) need++;
                    if (!used.ContainsKey(b) && b != a) need++;
                    if (!used.ContainsKey(c) && c != a && c != b) need++;
                    if (remap.Count + need > 2000) break;
                    tris[kept++] = MapVert(used, remap, a);
                    tris[kept++] = MapVert(used, remap, b);
                    tris[kept++] = MapVert(used, remap, c);
                }
                if (kept < 3) return null;
                if (kept < tris.Count) tris.RemoveRange(kept, tris.Count - kept);
                var geo = new Geo();
                geo.N = remap.Count;
                geo.T = tris.Count / 3;
                geo.Tris = tris.ToArray();
                geo.Xyzuv = new float[geo.N * 5];
                bool hasCol = colors != null && colors.Length == vertices.Length;
                if (hasCol) geo.Col = new byte[geo.N * 4];
                for (int i = 0; i < geo.N; i++)
                {
                    object v = vertices.GetValue(remap[i]);
                    int o = i * 5;
                    geo.Xyzuv[o] = U.Num(v, "x");
                    geo.Xyzuv[o + 1] = U.Num(v, "y");
                    geo.Xyzuv[o + 2] = U.Num(v, "z");
                    float tu = 0, tv = 0;
                    if (uv != null && remap[i] < uv.Length)
                    {
                        object q = uv.GetValue(remap[i]);
                        tu = U.Num(q, "x");
                        tv = 1f - U.Num(q, "y");
                    }
                    geo.Xyzuv[o + 3] = tu;
                    geo.Xyzuv[o + 4] = tv;
                    if (hasCol)
                    {
                        object col = colors.GetValue(remap[i]);
                        geo.Col[i * 4] = U.Chan(col, "r");
                        geo.Col[i * 4 + 1] = U.Chan(col, "g");
                        geo.Col[i * 4 + 2] = U.Chan(col, "b");
                        byte a = U.Chan(col, "a");
                        geo.Col[i * 4 + 3] = a == 0 ? (byte)255 : a;
                    }
                }
                return geo;
            }
            catch (Exception e)
            {
                LogMesh(mesh, e.GetType().Name);
                return BuildFromGpu(mesh);
            }
        }

        static bool _meshLogged;

        static void LogMesh(object mesh, string why)
        {
            if (_meshLogged || Info == null) return;
            _meshLogged = true;
            object readable = mesh == null ? null : U.Get(mesh, "isReadable");
            object name = mesh == null ? null : U.Get(mesh, "name");
            Info("mesh " + why + " name=" + name + " readable=" + readable);
        }

        static bool Matrix(object tr, out float m00, out float m01, out float m02, out float m03, out float m10, out float m11, out float m12, out float m13, out float m20, out float m21, out float m22, out float m23)
        {
            m00 = m01 = m02 = m03 = m10 = m11 = m12 = m13 = m20 = m21 = m22 = m23 = 0;
            if (tr == null) return false;
            object matrix = U.Get(tr, "localToWorldMatrix");
            if (matrix == null) return false;
            m00 = U.Num(matrix, "m00");
            m01 = U.Num(matrix, "m01");
            m02 = U.Num(matrix, "m02");
            m03 = U.Num(matrix, "m03");
            m10 = U.Num(matrix, "m10");
            m11 = U.Num(matrix, "m11");
            m12 = U.Num(matrix, "m12");
            m13 = U.Num(matrix, "m13");
            m20 = U.Num(matrix, "m20");
            m21 = U.Num(matrix, "m21");
            m22 = U.Num(matrix, "m22");
            m23 = U.Num(matrix, "m23");
            return true;
        }

        static void MaterialColor(object mat, ref byte r, ref byte g, ref byte b, ref byte a)
        {
            if (mat == null) return;
            object c = U.Get(mat, "color");
            if (c == null) return;
            r = U.Chan(c, "r");
            g = U.Chan(c, "g");
            b = U.Chan(c, "b");
            a = U.Chan(c, "a");
            if (a == 0) a = 255;
        }

        static uint TextureKey(object mat)
        {
            if (mat == null || _texBudget <= 0) return 0;
            object tex = U.Get(mat, "mainTexture");
            if (tex == null) return 0;
            int id = (int)U.Id(tex);
            uint known;
            if (_tex.TryGetValue(id, out known)) return known;
            _texBudget--;
            uint key = TryWriteTexture(tex, id);
            _tex[id] = key;
            if (key != 0) TextureCount++;
            return key;
        }

        static uint TryWriteTexture(object tex, int id)
        {
            try
            {
                Type rtType = U.Find("UnityEngine.RenderTexture");
                Type gfx = U.Find("UnityEngine.Graphics");
                Type texType = U.Find("UnityEngine.Texture2D");
                Type fmt = U.Find("UnityEngine.TextureFormat");
                if (rtType == null || gfx == null || texType == null || fmt == null) return 0;
                const int n = 128;
                MethodInfo temp = null;
                foreach (MethodInfo m in rtType.GetMethods(BindingFlags.Public | BindingFlags.Static))
                {
                    if (m.Name != "GetTemporary") continue;
                    ParameterInfo[] ps = m.GetParameters();
                    if (ps.Length == 3 && ps[0].ParameterType == typeof(int))
                    {
                        temp = m;
                        break;
                    }
                }
                MethodInfo blit = null;
                foreach (MethodInfo m in gfx.GetMethods(BindingFlags.Public | BindingFlags.Static))
                {
                    if (m.Name != "Blit") continue;
                    ParameterInfo[] ps = m.GetParameters();
                    if (ps.Length == 2)
                    {
                        blit = m;
                        break;
                    }
                }
                if (temp == null || blit == null) return 0;
                object rt = temp.Invoke(null, new object[] { n, n, 0 });
                blit.Invoke(null, new[] { tex, rt });
                PropertyInfo active = rtType.GetProperty("active", BindingFlags.Public | BindingFlags.Static);
                object prev = active.GetValue(null, null);
                active.SetValue(null, rt, null);
                object rgba = Enum.Parse(fmt, "RGBA32");
                object tmp = Activator.CreateInstance(texType, new object[] { n, n, rgba, false });
                Type rectType = U.Find("UnityEngine.Rect");
                object rect = Activator.CreateInstance(rectType, new object[] { 0f, 0f, (float)n, (float)n });
                MethodInfo read = texType.GetMethod("ReadPixels", new[] { rectType, typeof(int), typeof(int) });
                read.Invoke(tmp, new[] { rect, 0, 0 });
                MethodInfo apply = texType.GetMethod("Apply", Type.EmptyTypes);
                if (apply != null) apply.Invoke(tmp, null);
                MethodInfo pixels = texType.GetMethod("GetPixels32", Type.EmptyTypes);
                Array cols = (Array)pixels.Invoke(tmp, null);
                active.SetValue(null, prev, null);
                MethodInfo release = null;
                foreach (MethodInfo m in rtType.GetMethods(BindingFlags.Public | BindingFlags.Static))
                {
                    if (m.Name == "ReleaseTemporary" && m.GetParameters().Length == 1)
                    {
                        release = m;
                        break;
                    }
                }
                if (release != null) release.Invoke(null, new[] { rt });
                U.Destroy(tmp);
                if (cols == null || cols.Length != n * n) return 0;
                long sum = 0;
                int partial = 0;
                for (int i = 0; i < cols.Length; i += 16)
                {
                    object c = cols.GetValue(i);
                    int r = U.Chan(c, "r");
                    int g = U.Chan(c, "g");
                    int b = U.Chan(c, "b");
                    int a = U.Chan(c, "a");
                    sum += r + g + b;
                    if (a > 10 && a < 240) partial++;
                }
                if (sum < 30) return 0;
                uint key = unchecked((uint)id);
                if (key == 0) key = 1;
                WriteVtf(key, n, cols, partial > (cols.Length / 16) / 20);
                return key;
            }
            catch (Exception e)
            {
                if (Error != null) Error("texture: " + e.Message);
                return 0;
            }
        }

        static void WriteVtf(uint key, int n, Array cols, bool cutout)
        {
            string dir = MatDir();
            Directory.CreateDirectory(dir);
            string stem = "m_" + key.ToString();
            int header = 80;
            byte[] vtf = new byte[header + n * n * 4];
            Encoding.ASCII.GetBytes("VTF").CopyTo(vtf, 0);
            Bit(vtf, 4, 7);
            Bit(vtf, 8, 2);
            Bit(vtf, 12, header);
            vtf[16] = (byte)n;
            vtf[18] = (byte)n;
            Bit(vtf, 20, 0x4 | 0x8 | 0x100);
            vtf[24] = 1;
            BitF(vtf, 48, 1f);
            Bit(vtf, 52, 12);
            vtf[56] = 1;
            Bit(vtf, 57, unchecked((int)0xFFFFFFFF));
            vtf[63] = 1;
            for (int y = 0; y < n; y++)
            {
                int srcRow = y;
                int dstRow = n - 1 - y;
                for (int x = 0; x < n; x++)
                {
                    object c = cols.GetValue(srcRow * n + x);
                    int o = header + (dstRow * n + x) * 4;
                    byte a = U.Chan(c, "a");
                    if (!cutout) a = 255;
                    vtf[o] = U.Chan(c, "b");
                    vtf[o + 1] = U.Chan(c, "g");
                    vtf[o + 2] = U.Chan(c, "r");
                    vtf[o + 3] = a;
                }
            }
            File.WriteAllBytes(Path.Combine(dir, stem + ".vtf"), vtf);
            string alpha = cutout ? "\r\n$alphatest 1\r\n$alphatestreference 0.5" : "";
            string vmt = "UnlitGeneric\r\n{\r\n$basetexture \"shellbox/" + stem + "\"\r\n$vertexcolor 1\r\n$nocull 1\r\n$ignorez 0\r\n$model 1" + alpha + "\r\n}\r\n";
            File.WriteAllText(Path.Combine(dir, stem + ".vmt"), vmt);
        }

        static string MatDir()
        {
            string shell = Path.GetDirectoryName(_file.Name);
            string data = Path.GetDirectoryName(shell);
            string gmod = Path.GetDirectoryName(data);
            return Path.Combine(gmod, "materials", "shellbox");
        }

        static int CollectParticles(object tr, int parts)
        {
            if (parts >= MaxParts) return parts;
            if (_particle != null)
            {
                Array systems = U.Components(tr, _particle);
                for (int i = 0; i < systems.Length && parts < MaxParts; i++)
                    parts = EmitSystem(systems.GetValue(i), parts);
            }
            parts = EmitRibbon(tr, _trail, parts);
            parts = EmitRibbon(tr, _line, parts);
            return parts;
        }

        static float _maxDist;
        static float _cx, _cy, _cz;
        static bool _haveCam;

        static int EmitSystem(object system, int parts)
        {
            if (system == null || _getParticles == null || _partBuf == null || !U.Active(system)) return parts;
            uint id = U.Id(system);
            if (_partSeen.Contains(id)) return parts;
            if (_maxDist > 0f)
            {
                if (SkipLoose(system)) return parts;
                if (_haveCam)
                {
                    object ptr = U.Transform(system);
                    object ppos = ptr == null ? null : U.Get(ptr, "position");
                    if (ppos != null)
                    {
                        float dx = U.Num(ppos, "x") - _cx;
                        float dy = U.Num(ppos, "y") - _cy;
                        float dz = U.Num(ppos, "z") - _cz;
                        if (dx * dx + dy * dy + dz * dz > _maxDist * _maxDist) return parts;
                    }
                }
            }
            _partSeen.Add(id);
            object countObj = U.Get(system, "particleCount");
            int alive = countObj == null ? 0 : Convert.ToInt32(countObj);
            if (alive <= 0) return parts;
            int ask = Math.Min(alive, _partBuf.Length);
            int got;
            try
            {
                got = (int)_getParticles.Invoke(system, new object[] { _partBuf, ask });
            }
            catch
            {
                return parts;
            }
            if (got <= 0) return parts;
            object tr = U.Transform(system);
            int space = SimSpace(system);
            object custom = null;
            if (space == 2)
            {
                object main = U.Get(system, "main");
                if (main != null) custom = U.Get(main, "customSimulationSpace");
            }
            MethodInfo currentColor = system.GetType().GetMethod("GetParticleCurrentColor");
            MethodInfo currentSize = system.GetType().GetMethod("GetParticleCurrentSize");
            int take = Math.Min(got, 120);
            for (int i = 0; i < take && parts < MaxParts; i++)
            {
                object p = _partBuf.GetValue(i);
                float life = U.Num(p, "remainingLifetime");
                if (life <= 0) continue;
                object pos = U.Field(p, "position");
                if (pos == null) pos = U.Get(p, "position");
                float x = U.Num(pos, "x");
                float y = U.Num(pos, "y");
                float z = U.Num(pos, "z");
                if (space == 0 && tr != null) TransformPoint(tr, ref x, ref y, ref z);
                else if (space == 2 && custom != null) TransformPoint(custom, ref x, ref y, ref z);
                float size = U.Num(p, "startSize");
                if (currentSize != null)
                {
                    try { size = Convert.ToSingle(currentSize.Invoke(system, new[] { p })); }
                    catch { currentSize = null; }
                }
                if (size < 0.01f) size = 0.08f;
                object col = U.Field(p, "startColor");
                if (currentColor != null)
                {
                    try { col = currentColor.Invoke(system, new[] { p }); }
                    catch { currentColor = null; }
                }
                byte r = U.Chan(col, "r");
                byte g = U.Chan(col, "g");
                byte b = U.Chan(col, "b");
                byte a = U.Chan(col, "a");
                if (a < 8) continue;
                WritePart(parts, x, y, z, size, r, g, b, a);
                parts++;
            }
            return parts;
        }

        static int SimSpace(object system)
        {
            try
            {
                object main = U.Get(system, "main");
                if (main == null) return 1;
                object space = U.Get(main, "simulationSpace");
                if (space == null) return 1;
                return Convert.ToInt32(space);
            }
            catch
            {
                return 1;
            }
        }

        static void TransformPoint(object tr, ref float x, ref float y, ref float z)
        {
            float m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23;
            if (!Matrix(tr, out m00, out m01, out m02, out m03, out m10, out m11, out m12, out m13, out m20, out m21, out m22, out m23))
                return;
            float wx = m00 * x + m01 * y + m02 * z + m03;
            float wy = m10 * x + m11 * y + m12 * z + m13;
            float wz = m20 * x + m21 * y + m22 * z + m23;
            x = wx;
            y = wy;
            z = wz;
        }

        static int EmitRibbon(object tr, Type type, int parts)
        {
            if (type == null || parts >= MaxParts) return parts;
            Array all = U.Components(tr, type);
            for (int i = 0; i < all.Length && parts < MaxParts; i++)
            {
                object ribbon = all.GetValue(i);
                if (ribbon == null || !U.Active(ribbon)) continue;
                uint id = U.Id(ribbon);
                if (_partSeen.Contains(id)) continue;
                _partSeen.Add(id);
                object countObj = U.Get(ribbon, "positionCount");
                int count = countObj == null ? 0 : Convert.ToInt32(countObj);
                if (count < 2) continue;
                MethodInfo getPos = ribbon.GetType().GetMethod("GetPosition", new[] { typeof(int) });
                if (getPos == null) continue;
                object col = U.Get(ribbon, "startColor");
                byte r = U.Chan(col, "r");
                byte g = U.Chan(col, "g");
                byte b = U.Chan(col, "b");
                byte a = U.Chan(col, "a");
                if (a < 8) a = 255;
                float width = U.Num(ribbon, "widthMultiplier");
                if (width < 0.02f) width = U.Num(ribbon, "startWidth");
                if (width < 0.02f) width = 0.08f;
                int step = Math.Max(1, count / 16);
                for (int p = 0; p < count && parts < MaxParts; p += step)
                {
                    object pos = getPos.Invoke(ribbon, new object[] { p });
                    WritePart(parts, U.Num(pos, "x"), U.Num(pos, "y"), U.Num(pos, "z"), width, r, g, b, a);
                    parts++;
                }
            }
            return parts;
        }

        static bool SkipLoose(object system)
        {
            object go = U.Get(system, "gameObject");
            object name = go == null ? null : U.Get(go, "name");
            if (!(name is string)) return false;
            string s = ((string)name).ToLowerInvariant();
            return s.IndexOf("rain") >= 0 || s.IndexOf("snow") >= 0 || s.IndexOf("enviro") >= 0 || s.IndexOf("weather") >= 0 || s.IndexOf("cloud") >= 0;
        }

        static int CollectLoose(int parts)
        {
            if (_particle == null || parts >= MaxParts) return parts;
            _maxDist = 45f;
            _haveCam = false;
            Type camera = U.Find("UnityEngine.Camera");
            if (camera != null)
            {
                object cam = camera.GetProperty("main", BindingFlags.Public | BindingFlags.Static).GetValue(null, null);
                object ctr = cam == null ? null : U.Transform(cam);
                object pos = ctr == null ? null : U.Get(ctr, "position");
                if (pos != null)
                {
                    _cx = U.Num(pos, "x");
                    _cy = U.Num(pos, "y");
                    _cz = U.Num(pos, "z");
                    _haveCam = true;
                }
            }
            if (_looseCache == null || (_looseFrame++ % 30) == 0)
                _looseCache = U.FindObjects(_particle);
            Array all = _looseCache;
            if (all == null) return parts;
            int guard = 0;
            for (int i = 0; i < all.Length && parts < MaxParts && guard < 24; i++)
            {
                int before = parts;
                parts = EmitSystem(all.GetValue(i), parts);
                if (parts != before) guard++;
            }
            _maxDist = 0f;
            return parts;
        }

        static void WritePart(int index, float x, float y, float z, float size, byte r, byte g, byte b, byte a)
        {
            int o = PartAt + index * PartStride;
            PutF(o, x);
            PutF(o + 4, y);
            PutF(o + 8, z);
            PutF(o + 12, size);
            _buf[o + 16] = r;
            _buf[o + 17] = g;
            _buf[o + 18] = b;
            _buf[o + 19] = a;
        }

        static void WriteAt(int offset, int count)
        {
            _file.Position = offset;
            _file.Write(_buf, offset, count);
        }

        static void PutU16(int o, ushort v)
        {
            _buf[o] = (byte)v;
            _buf[o + 1] = (byte)(v >> 8);
        }

        static void PutU32(int o, uint v)
        {
            _buf[o] = (byte)v;
            _buf[o + 1] = (byte)(v >> 8);
            _buf[o + 2] = (byte)(v >> 16);
            _buf[o + 3] = (byte)(v >> 24);
        }

        static void PutF(int o, float v)
        {
            byte[] bits = BitConverter.GetBytes(v);
            Buffer.BlockCopy(bits, 0, _buf, o, 4);
        }

        static void Bit(byte[] b, int o, int v)
        {
            b[o] = (byte)v;
            b[o + 1] = (byte)(v >> 8);
            b[o + 2] = (byte)(v >> 16);
            b[o + 3] = (byte)(v >> 24);
        }

        static void BitF(byte[] b, int o, float v)
        {
            byte[] bits = BitConverter.GetBytes(v);
            Buffer.BlockCopy(bits, 0, b, o, 4);
        }
    }
}
