using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;

namespace Shellbox
{
    static class ShellboxHud
    {
        public static Action<string> Info;
        public static Action<string> Error;
        public static int WidgetCount;
        public static int Open;

        static readonly Dictionary<uint, object> _click = new Dictionary<uint, object>();
        static string _lastHud;
        static string _dir;
        static string _fail;
        static uint _lastCmd;
        static bool _primed;
        static int _phase;
        static bool _logged;
        static readonly string[] _types = new string[] {
            "FireworksMania.UI.Inventory.TabButton",
            "FireworksMania.UI.Inventory.InventoryItemSlotButton",
            "FireworksMania.UI.ToolsMenu.ToolMenuButton"
        };
        static readonly char[] _kinds = new char[] { 'T', 'S', 'O' };

        public static void Tick(string statePath)
        {
            try
            {
                if (_dir == null) _dir = Path.GetDirectoryName(statePath);
                Apply();
                _phase++;
                if ((_phase % 8) != 0) return;
                Scrape();
            }
            catch (Exception e)
            {
                if (_fail != e.Message)
                {
                    _fail = e.Message;
                    if (Error != null) Error("hud: " + e);
                }
            }
        }

        static void Apply()
        {
            string path = Path.Combine(_dir, "hudcmd.dat");
            if (!File.Exists(path))
            {
                _primed = true;
                return;
            }
            byte[] buf = new byte[16];
            int n;
            try
            {
                using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                    n = fs.Read(buf, 0, 16);
            }
            catch
            {
                return;
            }
            if (n < 16) return;
            if (buf[0] != (byte)'F' || buf[1] != (byte)'W' || buf[2] != (byte)'C' || buf[3] != (byte)'L') return;
            uint seq = (uint)(buf[8] | (buf[9] << 8) | (buf[10] << 16) | (buf[11] << 24));
            uint id = (uint)(buf[12] | (buf[13] << 8) | (buf[14] << 16) | (buf[15] << 24));
            if (!_primed)
            {
                _primed = true;
                _lastCmd = seq;
                return;
            }
            if (seq == _lastCmd || id == 0) return;
            _lastCmd = seq;
            object comp;
            if (!_click.TryGetValue(id, out comp) || comp == null) return;
            try
            {
                Invoke(comp);
                if (Info != null) Info("hud click " + id + " " + comp.GetType().Name);
            }
            catch (Exception e)
            {
                if (Error != null) Error("hud click: " + e.Message);
            }
        }

        static void Invoke(object comp)
        {
            Type toggle = U.Find("UnityEngine.UI.Toggle");
            if (toggle != null && toggle.IsInstanceOfType(comp))
            {
                PropertyInfo isOn = toggle.GetProperty("isOn");
                if (isOn != null && isOn.CanWrite) isOn.SetValue(comp, true, null);
                return;
            }
            int fired = 0;
            BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
            foreach (FieldInfo f in comp.GetType().GetFields(flags))
            {
                string n = f.Name.ToLowerInvariant();
                if (n.IndexOf("destroy") >= 0 || n.IndexOf("quit") >= 0 || n.IndexOf("exit") >= 0 || n.IndexOf("ban") >= 0 || n.IndexOf("kick") >= 0 || n.IndexOf("delete") >= 0)
                    continue;
                object v = f.GetValue(comp);
                if (v == null) continue;
                if (v.GetType().Name.IndexOf("UnityEvent") < 0) continue;
                MethodInfo call = v.GetType().GetMethod("Invoke", Type.EmptyTypes);
                if (call == null) continue;
                call.Invoke(v, null);
                fired++;
            }
            if (fired > 0) return;
            Type button = U.Find("UnityEngine.UI.Button");
            object target = comp;
            if (button != null && !button.IsInstanceOfType(comp))
            {
                Array kids = U.Components(comp, button);
                if (kids != null && kids.Length > 0) target = kids.GetValue(0);
            }
            if (button != null && target != null && button.IsInstanceOfType(target))
            {
                object ev = U.Get(target, "onClick");
                if (ev != null)
                {
                    MethodInfo call = ev.GetType().GetMethod("Invoke", Type.EmptyTypes);
                    if (call != null) call.Invoke(ev, null);
                }
            }
        }

        static void Scrape()
        {
            var selected = new HashSet<uint>();
            MarkSelected("FireworksMania.UI.Inventory.TabGroup", selected);
            MarkSelected("FireworksMania.UI.Inventory.InventoryUIController", selected);
            MarkSelected("FireworksMania.UI.ToolsMenu.ToolMenuUIController", selected);
            MarkSelected("FireworksMania.UI.ToolsMenu.ToolbarUIController", selected);

            var nextClick = new Dictionary<uint, object>();
            var lines = new StringBuilder();
            int count = 0;
            int open = 0;
            Type details = U.Find("FireworksMania.UI.Inventory.InventoryItemDetailsUIController");
            if (details != null)
            {
                Array all = U.FindObjects(details);
                for (int i = 0; i < all.Length; i++)
                {
                    object comp = all.GetValue(i);
                    if (!Shown(comp)) continue;
                    open = 1;
                    float x, y, w, h;
                    if (!RectOf(comp, out x, out y, out w, out h)) continue;
                    string name = DetailText(comp);
                    if (name.Length == 0) continue;
                    lines.Append("D 0 1 ");
                    AppendRect(lines, x, y, w, h);
                    lines.Append(' ');
                    lines.Append(name);
                    lines.Append('\n');
                    count++;
                    break;
                }
            }
            for (int t = 0; t < _types.Length; t++)
            {
                Type type = U.Find(_types[t]);
                if (type == null) continue;
                Array all = U.FindObjects(type, true);
                for (int pass = 0; pass < 2 && count < 40; pass++)
                for (int i = 0; i < all.Length && count < 40; i++)
                {
                    object comp = all.GetValue(i);
                    if (!U.Alive(comp)) continue;
                    bool on = U.Active(comp);
                    if (pass == 0 && !on) continue;
                    if (pass == 1 && on) continue;
                    open = on ? 1 : open;
                    float x, y, w, h;
                    if (!RectOf(comp, out x, out y, out w, out h))
                    {
                        x = 0; y = 0; w = 0.2f; h = 0.03f;
                    }
                    uint id = U.Id(comp);
                    if (id == 0 || nextClick.ContainsKey(id)) continue;
                    string name = Label(comp);
                    if (name.Length == 0) continue;
                    int sel = selected.Contains(id) || ChildMark(comp) ? 1 : 0;
                    nextClick[id] = comp;
                    lines.Append(_kinds[t]);
                    lines.Append(' ');
                    lines.Append(id.ToString(CultureInfo.InvariantCulture));
                    lines.Append(' ');
                    lines.Append(sel.ToString(CultureInfo.InvariantCulture));
                    lines.Append(' ');
                    AppendRect(lines, x, y, w, h);
                    lines.Append(' ');
                    lines.Append(name);
                    lines.Append('\n');
                    count++;
                    if (!_logged && name.Length > 0)
                    {
                        _logged = true;
                        if (Info != null) Info("hud label " + type.Name + " " + name);
                    }
                }
            }
            if (count == 0)
            {
                if (_lastHud != null) File.WriteAllText(Path.Combine(_dir, "hud.txt"), _lastHud);
                return;
            }
            _click.Clear();
            foreach (var pair in nextClick) _click[pair.Key] = pair.Value;
            WidgetCount = count;
            Open = open;
            var head = new StringBuilder();
            head.Append("HUD1 ");
            head.Append(_phase.ToString(CultureInfo.InvariantCulture));
            head.Append(' ');
            head.Append(open.ToString(CultureInfo.InvariantCulture));
            head.Append('\n');
            head.Append(lines);
            _lastHud = head.ToString();
            File.WriteAllText(Path.Combine(_dir, "hud.txt"), _lastHud);
        }

        static void MarkSelected(string typeName, HashSet<uint> into)
        {
            Type type = U.Find(typeName);
            if (type == null) return;
            Array all = U.FindObjects(type);
            BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
            for (int i = 0; i < all.Length; i++)
            {
                object comp = all.GetValue(i);
                if (comp == null) continue;
                foreach (FieldInfo f in comp.GetType().GetFields(flags))
                {
                    string n = f.Name.ToLowerInvariant();
                    if (n.IndexOf("select") < 0 && n.IndexOf("current") < 0) continue;
                    object v = f.GetValue(comp);
                    if (v == null) continue;
                    uint id = U.Id(v);
                    if (id != 0) into.Add(id);
                }
            }
        }

        static bool Shown(object comp)
        {
            if (comp == null || !U.Active(comp)) return false;
            object go = U.Get(comp, "gameObject");
            if (go == null || !U.Active(go)) return false;
            Type canvasType = U.Find("UnityEngine.Canvas");
            if (canvasType == null) return true;
            object canvas = ParentComponent(go, canvasType);
            if (canvas == null) return true;
            object en = U.Get(canvas, "enabled");
            if (en is bool && !(bool)en) return false;
            object cgo = U.Get(canvas, "gameObject");
            return cgo == null || U.Active(cgo);
        }

        static object ParentComponent(object go, Type type)
        {
            MethodInfo m = null;
            foreach (MethodInfo cand in go.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance))
            {
                if (cand.Name == "GetComponentInParent" && !cand.IsGenericMethod && cand.GetParameters().Length == 1 && cand.GetParameters()[0].ParameterType == typeof(Type))
                {
                    m = cand;
                    break;
                }
            }
            if (m == null) return null;
            return m.Invoke(go, new object[] { type });
        }

        static bool RectOf(object comp, out float x, out float y, out float w, out float h)
        {
            x = y = w = h = 0;
            Type rtType = U.Find("UnityEngine.RectTransform");
            if (rtType == null) return false;
            object go = U.Get(comp, "gameObject");
            if (go == null) return false;
            MethodInfo get = go.GetType().GetMethod("GetComponent", new[] { typeof(Type) });
            if (get == null) return false;
            object rt = get.Invoke(go, new object[] { rtType });
            if (rt == null) return false;
            Type v3 = U.Find("UnityEngine.Vector3");
            Array corners = Array.CreateInstance(v3, 4);
            MethodInfo cornersMethod = null;
            foreach (MethodInfo m in rt.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance))
            {
                if (m.Name != "GetWorldCorners") continue;
                ParameterInfo[] ps = m.GetParameters();
                if (ps.Length == 1 && ps[0].ParameterType.IsArray)
                {
                    cornersMethod = m;
                    break;
                }
            }
            if (cornersMethod == null) return false;
            cornersMethod.Invoke(rt, new object[] { corners });
            Type canvasType = U.Find("UnityEngine.Canvas");
            object canvas = ParentComponent(go, canvasType);
            int mode = 0;
            object cam = null;
            if (canvas != null)
            {
                object modeObj = U.Get(canvas, "renderMode");
                if (modeObj != null) mode = Convert.ToInt32(modeObj);
                if (mode == 1) cam = U.Get(canvas, "worldCamera");
            }
            if (mode != 0)
            {
                if (cam == null)
                {
                    Type camera = U.Find("UnityEngine.Camera");
                    if (camera != null)
                        cam = camera.GetProperty("main", BindingFlags.Public | BindingFlags.Static).GetValue(null, null);
                }
                if (cam == null) return false;
                MethodInfo w2s = null;
                foreach (MethodInfo m in cam.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance))
                {
                    if (m.Name == "WorldToScreenPoint" && m.GetParameters().Length == 1)
                    {
                        w2s = m;
                        break;
                    }
                }
                if (w2s == null) return false;
                for (int i = 0; i < 4; i++)
                    corners.SetValue(w2s.Invoke(cam, new[] { corners.GetValue(i) }), i);
            }
            float sw = ScreenAxis("width");
            float sh = ScreenAxis("height");
            if (sw < 2f || sh < 2f) return false;
            float left = U.Num(corners.GetValue(0), "x");
            float bottom = U.Num(corners.GetValue(0), "y");
            float top = U.Num(corners.GetValue(1), "y");
            float right = U.Num(corners.GetValue(2), "x");
            x = left / sw;
            y = 1f - (top / sh);
            w = (right - left) / sw;
            h = (top - bottom) / sh;
            if (w < 0) { x += w; w = -w; }
            if (h < 0) { y += h; h = -h; }
            if (x > 1.2f || y > 1.2f || x + w < -0.2f || y + h < -0.2f) return false;
            return w > 0.002f && h > 0.002f;
        }

        static float ScreenAxis(string name)
        {
            Type screen = U.Find("UnityEngine.Screen");
            if (screen == null) return 0;
            object v = screen.GetProperty(name, BindingFlags.Public | BindingFlags.Static).GetValue(null, null);
            return Convert.ToSingle(v);
        }

        static string Label(object comp)
        {
            string text = Texts(comp, 42, false);
            string field = FieldLabel(comp);
            if (text.Length > 1 && !AllDigits(text)) return text;
            if (field.Length > 1) return field;
            if (text.Length > 0) return text;
            object go = U.Get(comp, "gameObject");
            object name = go == null ? null : U.Get(go, "name");
            return Clean(name as string);
        }

        static string DetailText(object comp)
        {
            string text = Texts(comp, 160, true);
            string field = FieldLabel(comp);
            if (field.Length > 0 && text.IndexOf(field) < 0)
            {
                if (text.Length == 0) return field;
                return field + "  " + text;
            }
            return text;
        }

        static string Texts(object comp, int cap, bool longOnes)
        {
            var sb = new StringBuilder();
            AppendTexts(comp, U.Find("UnityEngine.UI.Text"), sb, cap, longOnes);
            if (sb.Length < cap) AppendTexts(comp, U.Find("TMPro.TMP_Text"), sb, cap, longOnes);
            if (sb.Length < cap) AppendTexts(comp, U.Find("TMPro.TextMeshProUGUI"), sb, cap, longOnes);
            return Clean(sb.ToString());
        }

        static void AppendTexts(object comp, Type type, StringBuilder sb, int cap, bool longOnes)
        {
            if (type == null || sb.Length >= cap) return;
            Array all = U.Components(comp, type);
            for (int i = 0; i < all.Length && sb.Length < cap; i++)
            {
                object text = all.GetValue(i);
                if (text == null || !U.Active(text)) continue;
                object en = U.Get(text, "enabled");
                if (en is bool && !(bool)en) continue;
                object raw = U.Get(text, "text");
                string s = Clean(raw as string);
                if (s.Length == 0) continue;
                if (!longOnes && s.Length > 42) continue;
                if (sb.Length > 0) sb.Append(' ');
                sb.Append(s);
            }
        }

        static string FieldLabel(object comp)
        {
            BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
            foreach (FieldInfo f in comp.GetType().GetFields(flags))
            {
                object v = f.GetValue(comp);
                if (v == null) continue;
                if (v is string)
                {
                    string s = Clean((string)v);
                    if (GoodName(s)) return s;
                    continue;
                }
                string[] props = new string[] { "DisplayName", "ItemName", "Name" };
                for (int i = 0; i < props.Length; i++)
                {
                    object p = U.Get(v, props[i]);
                    string s = Clean(p as string);
                    if (GoodName(s)) return s;
                }
            }
            return "";
        }

        static bool GoodName(string s)
        {
            if (s == null || s.Length < 2 || s.Length > 60) return false;
            if (s.IndexOf('/') >= 0 || s.IndexOf('\\') >= 0 || s.IndexOf("FireworksMania") >= 0) return false;
            return true;
        }

        static bool AllDigits(string s)
        {
            for (int i = 0; i < s.Length; i++)
            {
                if (s[i] < '0' || s[i] > '9') return false;
            }
            return s.Length > 0;
        }

        static bool ChildMark(object comp)
        {
            object tr = U.Transform(comp);
            if (tr == null) return false;
            PropertyInfo countProp = tr.GetType().GetProperty("childCount");
            MethodInfo getChild = tr.GetType().GetMethod("GetChild", new[] { typeof(int) });
            if (countProp == null || getChild == null) return false;
            int n = (int)countProp.GetValue(tr, null);
            if (n > 12) n = 12;
            for (int i = 0; i < n; i++)
            {
                object child = getChild.Invoke(tr, new object[] { i });
                object go = U.Get(child, "gameObject");
                if (go == null || !U.Active(go)) continue;
                object name = U.Get(go, "name");
                if (!(name is string)) continue;
                string s = ((string)name).ToLowerInvariant();
                if (s.IndexOf("select") >= 0 || s.IndexOf("highlight") >= 0 || s.IndexOf("active") >= 0)
                    return true;
            }
            return false;
        }

        static string Clean(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            var sb = new StringBuilder();
            bool tag = false;
            for (int i = 0; i < s.Length && sb.Length < 160; i++)
            {
                char c = s[i];
                if (c == '<') { tag = true; continue; }
                if (c == '>') { tag = false; continue; }
                if (tag) continue;
                if (c == '\n' || c == '\r' || c == '\t') c = ' ';
                sb.Append(c);
            }
            return sb.ToString().Trim();
        }

        static void AppendRect(StringBuilder sb, float x, float y, float w, float h)
        {
            sb.Append(x.ToString("0.0000", CultureInfo.InvariantCulture));
            sb.Append(' ');
            sb.Append(y.ToString("0.0000", CultureInfo.InvariantCulture));
            sb.Append(' ');
            sb.Append(w.ToString("0.0000", CultureInfo.InvariantCulture));
            sb.Append(' ');
            sb.Append(h.ToString("0.0000", CultureInfo.InvariantCulture));
        }
    }
}
