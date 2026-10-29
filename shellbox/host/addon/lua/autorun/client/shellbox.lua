-- Shellbox host. Reads docs/CONTRACT.md snapshots and draws them in Garry's Mod.
-- Scale 40 Source units per guest metre. Guest yaw 0 faces +Z; host yaw 0 faces +X.

local SCALE = 40
local HEADER = 64
local RECORD = 48
local MAX_RECORDS = 48
local FILE_SIZE = HEADER + RECORD * MAX_RECORDS

-- Stock glow materials set $ignorez 1, so they draw through the map.
local glow = CreateMaterial("shellbox_glow1", "UnlitGeneric", {
	["$basetexture"] = "sprites/light_glow02",
	["$additive"] = 1,
	["$vertexcolor"] = 1,
	["$vertexalpha"] = 1,
	["$translucent"] = 1,
	["$ignorez"] = 0,
	["$nocull"] = 1,
})
local meshMat = CreateMaterial("shellbox_mesh1", "UnlitGeneric", {
	["$basetexture"] = "vgui/white",
	["$vertexcolor"] = 1,
	["$nocull"] = 1,
	["$ignorez"] = 0,
	["$model"] = 1,
})
local MAX_MESH, MAX_VERTS, MAX_TRIS, MAX_PARTS = 24, 4000, 3000, 1000
local MESH_STRIDE, VERT_STRIDE, TRI_STRIDE, PART_STRIDE = 24, 24, 6, 20
local MESH_AT = 64
local VERT_AT = MESH_AT + MAX_MESH * MESH_STRIDE
local TRI_AT = VERT_AT + MAX_VERTS * VERT_STRIDE
local PART_AT = TRI_AT + MAX_TRIS * TRI_STRIDE
local GEOM_SIZE = PART_AT + MAX_PARTS * PART_STRIDE
local snap = nil
local anchor = nil
local blocked = {}
local stuck = {}
local lastTick = nil
local lastTickAt = 0
local trails = {}
local boomed = {}
local lastLog = 0
local status = "Shellbox: no snapshot yet"
local soundBudget = 0
local geom
local geomSeq = -1
local geomAt = 0
local catalog = {}
local catalogTypes = { "All" }
local catType = "All"
local catScroll = 0
local lastCatRaw = ""
local rows = {}
local spawnSeq = 0
local spawnNote = ""
local spawnNoteUntil = 0
local clickerOn = false
local mouseWas = false
local keyWas = {}
local texmats = {}
local ROW_N = 11

local function u16(s, i)
	local a, b = s:byte(i, i + 1)
	if not a then return 0 end
	return a + b * 256
end

local function u32(s, i)
	local a, b, c, d = s:byte(i, i + 3)
	if not a then return 0 end
	return a + b * 256 + c * 65536 + d * 16777216
end

local function f32(s, i)
	local n = u32(s, i)
	local sign = math.floor(n / 2147483648) % 2
	local exp = math.floor(n / 8388608) % 256
	local frac = n % 8388608
	if exp == 0 then return 0 end
	if exp == 255 then
		if frac == 0 then return sign == 1 and -math.huge or math.huge end
		return 0
	end
	local mag = math.pow(2, exp - 127) * (1 + frac / 8388608)
	if sign == 1 then mag = -mag end
	return mag
end

local function pack_u16(n)
	n = math.floor(n) % 65536
	return string.char(n % 256, math.floor(n / 256) % 256)
end

local function pack_u32(n)
	n = math.floor(n) % 4294967296
	return string.char(
		n % 256,
		math.floor(n / 256) % 256,
		math.floor(n / 65536) % 256,
		math.floor(n / 16777216) % 256
	)
end

local function pack_f32(x)
	if x ~= x or x == 0 then return string.char(0, 0, 0, 0) end
	local sign = 0
	if x < 0 then
		sign = 1
		x = -x
	end
	if x == math.huge then return string.char(0, 0, 128, 127 + sign * 128) end
	local m, e = math.frexp(x)
	e = e - 1
	m = m * 2 - 1
	local exp = e + 127
	if exp <= 0 then return string.char(0, 0, 0, sign * 128) end
	if exp >= 255 then return string.char(0, 0, 128, 127 + sign * 128) end
	local frac = math.floor(m * 8388608 + 0.5)
	if frac >= 8388608 then
		frac = 0
		exp = exp + 1
		if exp >= 255 then return string.char(0, 0, 128, 127 + sign * 128) end
	end
	local bits = sign * 2147483648 + exp * 8388608 + frac
	return pack_u32(bits)
end

-- Returns host offset x, y, z in Source units.
local function map_offset(ux, uy, uz, guestYaw, hostYaw)
	local yaw = math.rad(guestYaw)
	local local_f = ux * math.sin(yaw) + uz * math.cos(yaw)
	local local_r = ux * math.cos(yaw) - uz * math.sin(yaw)
	local gy = math.rad(hostYaw)
	local s = SCALE
	local ox = math.cos(gy) * local_f * s + math.sin(gy) * local_r * s
	local oy = math.sin(gy) * local_f * s + (-math.cos(gy)) * local_r * s
	local oz = uy * s
	return ox, oy, oz
end

local function read_once()
	local f = file.Open("shellbox/state.bin", "rb", "DATA")
	if not f then return nil end
	local data = f:Read(FILE_SIZE) or ""
	f:Close()
	if #data < HEADER then return nil end
	if data:sub(1, 4) ~= "FWGM" then return nil end
	if u16(data, 5) ~= 1 then return nil end
	local seq = u32(data, 9)
	if seq % 2 == 1 then return nil end
	return data, seq
end

local function read_snapshot()
	local a, seq1 = read_once()
	if not a then return nil end
	local b, seq2 = read_once()
	if not b or seq1 ~= seq2 then return nil end
	local count = u16(b, 21)
	if count > MAX_RECORDS then return nil end
	local out = {
		seq = seq2,
		tick = u32(b, 13),
		flags = u16(b, 23),
		camx = f32(b, 25),
		camy = f32(b, 29),
		camz = f32(b, 33),
		yaw = f32(b, 37),
		pitch = f32(b, 41),
		items = {},
	}
	for n = 0, count - 1 do
		local o = HEADER + n * RECORD + 1
		out.items[#out.items + 1] = {
			id = u32(b, o),
			kind = b:byte(o + 4),
			state = b:byte(o + 5),
			r = b:byte(o + 6),
			g = b:byte(o + 7),
			b = b:byte(o + 8),
			x = f32(b, o + 12),
			y = f32(b, o + 16),
			z = f32(b, o + 20),
			vx = f32(b, o + 24),
			vy = f32(b, o + 28),
			vz = f32(b, o + 32),
			radius = f32(b, o + 36),
		}
	end
	return out
end

local function plant_anchor(ply, guest)
	anchor = {
		gx = guest.camx,
		gy = guest.camy,
		gz = guest.camz,
		gyaw = guest.yaw,
		hpos = ply:EyePos(),
		hyaw = ply:EyeAngles().y,
	}
	blocked = {}
	stuck = {}
	trails = {}
end

-- Shells stay where they were planted. Later guest motion moves them through the map;
-- turning or walking in Garry's Mod does not drag the show.
local function mapper()
	if not anchor then return nil end
	local yaw = math.rad(anchor.gyaw)
	local sy, cy = math.sin(yaw), math.cos(yaw)
	local gy = math.rad(anchor.hyaw)
	local sgy, cgy = math.sin(gy), math.cos(gy)
	local ax, ay, az = anchor.gx, anchor.gy, anchor.gz
	local hx, hy, hz = anchor.hpos.x, anchor.hpos.y, anchor.hpos.z
	return function(x, y, z)
		local ux, uy, uz = x - ax, y - ay, z - az
		local lf = ux * sy + uz * cy
		local lr = ux * cy - uz * sy
		return Vector(
			hx + (cgy * lf + sgy * lr) * SCALE,
			hy + (sgy * lf - cgy * lr) * SCALE,
			hz + uy * SCALE
		)
	end
end

local function world_pos(item)
	local map = mapper()
	if not map then return nil end
	return map(item.x, item.y, item.z)
end

-- Inverse of mapper(). Guest metres from a point in the planted host frame.
local function host_to_guest(pos)
	if not anchor or not pos then return nil end
	local ox = pos.x - anchor.hpos.x
	local oy = pos.y - anchor.hpos.y
	local oz = pos.z - anchor.hpos.z
	local hy = math.rad(anchor.hyaw)
	local lf = (math.cos(hy) * ox + math.sin(hy) * oy) / SCALE
	local lr = (math.sin(hy) * ox - math.cos(hy) * oy) / SCALE
	local gy = math.rad(anchor.gyaw)
	local ux = math.sin(gy) * lf + math.cos(gy) * lr
	local uz = math.cos(gy) * lf - math.sin(gy) * lr
	return anchor.gx + ux, anchor.gy + oz / SCALE, anchor.gz + uz
end

local function host_dir_to_guest(dir)
	if not anchor or not dir then return 0, 0, 0 end
	local hy = math.rad(anchor.hyaw)
	local lf = math.cos(hy) * dir.x + math.sin(hy) * dir.y
	local lr = math.sin(hy) * dir.x - math.cos(hy) * dir.y
	local gy = math.rad(anchor.gyaw)
	local ux = math.sin(gy) * lf + math.cos(gy) * lr
	local uz = math.cos(gy) * lf - math.sin(gy) * lr
	return ux, dir.z, uz
end

local function mat_for(key)
	if not key or key == 0 then return meshMat end
	local cached = texmats[key]
	if cached then return cached end
	local stem = string.format("%.0f", key)
	if not file.Exists("materials/shellbox/m_" .. stem .. ".vmt", "GAME") then return meshMat end
	local m = Material("shellbox/m_" .. stem)
	if not m or m:IsError() then return meshMat end
	texmats[key] = m
	return m
end

local function read_geom_once()
	local f = file.Open("shellbox/geom.bin", "rb", "DATA")
	if not f then return nil end
	local data = f:Read(GEOM_SIZE) or ""
	f:Close()
	if #data < GEOM_SIZE then return nil end
	if data:sub(1, 4) ~= "FWGE" then return nil end
	if u16(data, 5) ~= 1 then return nil end
	local seq = u32(data, 9)
	if seq % 2 == 1 then return nil end
	return data, seq
end

local function take_geom()
	local a, seq1 = read_geom_once()
	if not a then return end
	local b, seq2 = read_geom_once()
	if not b or seq1 ~= seq2 then return end
	geomAt = CurTime()
	if seq2 == geomSeq then return end
	local meshesN = u16(b, 17)
	local partsN = u16(b, 19)
	local vertsN = u32(b, 21)
	local trisN = u32(b, 25)
	if meshesN > MAX_MESH or partsN > MAX_PARTS or vertsN > MAX_VERTS or trisN > MAX_TRIS then return end
	local meshes, verts, tris, parts = {}, {}, {}, {}
	for i = 0, meshesN - 1 do
		local o = MESH_AT + i * MESH_STRIDE + 1
		meshes[#meshes + 1] = {
			vertStart = u32(b, o + 4),
			triStart = u32(b, o + 8),
			vertCount = u16(b, o + 12),
			triCount = u16(b, o + 14),
			tex = u32(b, o + 16),
		}
	end
	for i = 0, vertsN - 1 do
		local o = VERT_AT + i * VERT_STRIDE + 1
		verts[i + 1] = {
			f32(b, o), f32(b, o + 4), f32(b, o + 8),
			f32(b, o + 12), f32(b, o + 16),
			b:byte(o + 20) or 255, b:byte(o + 21) or 255, b:byte(o + 22) or 255, b:byte(o + 23) or 255,
		}
	end
	for i = 0, trisN - 1 do
		local o = TRI_AT + i * TRI_STRIDE + 1
		tris[i + 1] = { u16(b, o) + 1, u16(b, o + 2) + 1, u16(b, o + 4) + 1 }
	end
	for i = 0, partsN - 1 do
		local o = PART_AT + i * PART_STRIDE + 1
		parts[i + 1] = {
			f32(b, o), f32(b, o + 4), f32(b, o + 8), f32(b, o + 12),
			b:byte(o + 16) or 255, b:byte(o + 17) or 255, b:byte(o + 18) or 255, b:byte(o + 19) or 255,
		}
	end
	geom = { meshes = meshes, verts = verts, tris = tris, parts = parts, meshCount = meshesN, particleCount = partsN }
	geomSeq = seq2
	geomAt = CurTime()
end

local shown = {}

local function read_catalog()
	local f = file.Open("shellbox/catalog.txt", "r", "DATA")
	if not f then return end
	local raw = f:Read(262144) or ""
	f:Close()
	if raw == "" or raw == lastCatRaw then return end
	lastCatRaw = raw
	local items = {}
	local seenType = { All = true }
	local order = { "All" }
	for line in string.gmatch(raw, "[^\n]+") do
		if line:sub(1, 4) ~= "CAT1" then
			local typ, id, mode, name = line:match("^([^\t]*)\t([^\t]+)\t([PF])\t(.*)$")
			if id and name and name ~= "" then
				local t = typ ~= "" and typ or "Item"
				items[#items + 1] = { type = t, id = id, mode = mode, name = name }
				if not seenType[t] then
					seenType[t] = true
					order[#order + 1] = t
				end
			end
		end
	end
	catalog = items
	catalogTypes = order
	local kept = false
	for i = 1, #order do
		if order[i] == catType then kept = true end
	end
	if not kept then catType = "All" end
end

local function filtered()
	local list = {}
	for i = 1, #catalog do
		local it = catalog[i]
		if catType == "All" or it.type == catType then
			list[#list + 1] = it
		end
	end
	local maxScroll = math.max(0, #list - ROW_N)
	if catScroll > maxScroll then catScroll = maxScroll end
	if catScroll < 0 then catScroll = 0 end
	shown = list
	return list
end

local function layout_catalog()
	rows = {}
	local list = filtered()
	local y = 78
	if #catalogTypes > 2 then
		rows[#rows + 1] = {
			kind = "type",
			x = 16, y = y, w = 300, h = 22,
			label = catType .. "   " .. tostring(#list),
		}
		y = y + 24
	end
	for i = 1, ROW_N do
		local it = list[catScroll + i]
		if not it then break end
		rows[#rows + 1] = {
			kind = "item",
			item = it,
			slot = i,
			x = 16, y = y, w = 300, h = 22,
			label = it.name,
		}
		y = y + 24
	end
end

local function cycle_type()
	if #catalogTypes < 2 then return end
	local idx = 1
	for i = 1, #catalogTypes do
		if catalogTypes[i] == catType then idx = i end
	end
	idx = idx % #catalogTypes + 1
	catType = catalogTypes[idx]
	catScroll = 0
end

local function spawn_item(item)
	if not item or not item.id or string.find(item.id, "\n", 1, true) then return end
	local ply = LocalPlayer()
	if not IsValid(ply) then return end
	if not anchor and snap and bit.band(snap.flags or 0, 1) == 1 then
		plant_anchor(ply, snap)
	end
	if not anchor then
		spawnNote = "Look around in the map once so Shellbox can plant."
		spawnNoteUntil = CurTime() + 4
		return
	end
	local aim = ply:GetAimVector()
	local tr = util.TraceLine({
		start = ply:EyePos(),
		endpos = ply:EyePos() + aim * 4096,
		filter = ply,
		mask = MASK_SOLID,
	})
	local pos = ply:EyePos() + aim * 180
	if tr.Hit and not tr.HitSky then
		pos = tr.HitPos + tr.HitNormal * 8
	end
	local gx, gy, gz = host_to_guest(pos)
	if not gx then return end
	local yaw = anchor.gyaw - (ply:EyeAngles().y - anchor.hyaw)
	local vx, vy, vz, kin = 0, 0, 0, 1
	if item.mode == "F" then
		kin = 0
		local dx, dy, dz = host_dir_to_guest(aim)
		vx, vy, vz = dx * 14, dy * 14 + 8, dz * 14
	end
	spawnSeq = spawnSeq + 1
	local body = "SP1\n" .. tostring(spawnSeq) .. "\n" .. item.id .. "\n" .. string.format(
		"%.4f %.4f %.4f %.3f %.4f %.4f %.4f %d 1\n",
		gx, gy, gz, yaw, vx, vy, vz, kin
	)
	file.CreateDir("shellbox")
	file.Write("shellbox/spawn.txt", body)
	spawnNote = "Spawning " .. item.name
	spawnNoteUntil = CurTime() + 4
end

local function catalog_input()
	local alt = input.IsKeyDown(KEY_LALT)
	if alt and not clickerOn and not vgui.CursorVisible() then
		gui.EnableScreenClicker(true)
		clickerOn = true
	end
	if clickerOn and not alt then
		gui.EnableScreenClicker(false)
		clickerOn = false
	end
	layout_catalog()
	local armed = alt or vgui.CursorVisible()
	local down = input.IsMouseDown(MOUSE_LEFT)
	if down and not mouseWas and armed then
		local mx, my = gui.MouseX(), gui.MouseY()
		for i = 1, #rows do
			local w = rows[i]
			if mx >= w.x and my >= w.y and mx <= w.x + w.w and my <= w.y + w.h then
				if w.kind == "type" then
					cycle_type()
				elseif w.item then
					spawn_item(w.item)
				end
				break
			end
		end
	end
	mouseWas = down
	if not armed then return end
	local keys = { KEY_1, KEY_2, KEY_3, KEY_4, KEY_5, KEY_6, KEY_7, KEY_8, KEY_9 }
	for i = 1, #keys do
		local held = input.IsKeyDown(keys[i])
		if held and not keyWas[i] then
			local it = shown[catScroll + i]
			if it then spawn_item(it) end
		end
		keyWas[i] = held
	end
end

local function geom_live()
	return geom and (CurTime() - geomAt) <= 1 and (geom.meshCount > 0 or geom.particleCount > 0)
end

local function trace_world(a, b)
	return util.TraceLine({
		start = a,
		endpos = b,
		mask = MASK_SOLID,
		filter = LocalPlayer(),
	})
end

local function consider_hit(item, pos, prev)
	if item.state ~= 0 then return nil end
	if item.kind ~= 1 then return nil end
	if not prev then return nil end
	if prev:DistToSqr(pos) < 0.04 then return nil end
	local tr = trace_world(prev, pos)
	if not tr.Hit or tr.HitSky then return nil end
	return tr
end

local function prop_bump(pos)
	local near = ents.FindInSphere(pos, 36)
	for i = 1, #near do
		local ent = near[i]
		if IsValid(ent) and not ent:IsPlayer() and ent:GetClass() ~= "worldspawn" then
			local phys = ent:GetPhysicsObject()
			if IsValid(phys) then
				local vel = phys:GetVelocity()
				if vel:LengthSqr() > 2500 then return ent end
			end
		end
	end
	return nil
end

local function kick_prop(ent, vel)
	if not IsValid(ent) or ent:IsPlayer() or ent:GetClass() == "worldspawn" then return false end
	local phys = ent:GetPhysicsObject()
	if not IsValid(phys) then return false end
	phys:EnableMotion(true)
	phys:Wake()
	phys:AddVelocity(vel)
	return true
end

local function shove(pos, dir, hitEnt, power)
	local kicked = 0
	if kick_prop(hitEnt, dir * power) then kicked = 1 end
	local near = ents.FindInSphere(pos, 220)
	for i = 1, #near do
		if kicked >= 16 then break end
		local ent = near[i]
		if ent ~= hitEnt then
			local delta = ent:WorldSpaceCenter() - pos
			local len = delta:Length()
			if len < 16 then len = 16 end
			if len < 220 then
				delta:Normalize()
				local scale = power * (1 - len / 220) * 0.65
				if scale > 40 and kick_prop(ent, delta * scale) then
					kicked = kicked + 1
				end
			end
		end
	end
end

local function write_hits(hits)
	local seq = 2
	local parts = {"FWHT", pack_u16(1), pack_u16(16), pack_u32(seq), pack_u16(#hits), pack_u16(0)}
	for i = 1, #hits do
		local h = hits[i]
		parts[#parts + 1] = pack_u32(h.id) .. string.char(h.kind, 0, 0, 0) .. pack_f32(h.x) .. pack_f32(h.y) .. pack_f32(h.z)
	end
	file.CreateDir("shellbox")
	file.Write("shellbox/hits.dat", table.concat(parts))
end

local function boom(pos, dir, hitEnt, power)
	local ed = EffectData()
	ed:SetOrigin(pos)
	ed:SetMagnitude(8)
	ed:SetScale(2)
	util.Effect("Explosion", ed)
	if soundBudget <= CurTime() then
		soundBudget = CurTime() + 0.15
		sound.Play("ambient/explosions/explode_4.wav", pos, 90, 100, 1)
	end
	if not dir then dir = Vector(0, 0, 1) end
	shove(pos, dir, hitEnt, power or 320)
end

local function remember_hit(item, hitPos, dir, hitEnt, power)
	local gx, gy, gz = host_to_guest(hitPos)
	if not gx then gx, gy, gz = item.x, item.y, item.z end
	blocked[item.id] = hitPos
	stuck[item.id] = { kind = item.kind, x = gx, y = gy, z = gz }
	if not boomed[item.id] then
		boomed[item.id] = true
		boom(hitPos, dir, hitEnt, power)
	end
end

hook.Add("PlayerBindPress", "shellbox_scroll", function(ply, bind, pressed)
	if not pressed then return end
	if not input.IsKeyDown(KEY_LALT) and not vgui.CursorVisible() then return end
	if bind == "invnext" then
		catScroll = catScroll + 1
		return true
	elseif bind == "invprev" then
		catScroll = math.max(0, catScroll - 1)
		return true
	end
end)

hook.Add("Think", "shellbox", function()
	local ok, err = pcall(function()
		take_geom()
		read_catalog()
		catalog_input()
		local fresh = read_snapshot()
		if fresh then
			if lastTick == nil or fresh.tick ~= lastTick then
				lastTick = fresh.tick
				lastTickAt = CurTime()
			end
			if snap and fresh.tick < snap.tick then
				boomed = {}
				trails = {}
				blocked = {}
				stuck = {}
				anchor = nil
			end
			snap = fresh
		end
		local ply = LocalPlayer()
		local stale = snap and (CurTime() - lastTickAt > 1) or false
		local hits = {}
		if IsValid(ply) and snap and not stale and bit.band(snap.flags, 1) == 1 then
			local jumped = false
			if anchor then
				local dx = snap.camx - anchor.gx
				local dy = snap.camy - anchor.gy
				local dz = snap.camz - anchor.gz
				jumped = (dx * dx + dy * dy + dz * dz) > (40 * 40)
			end
			-- Plant on the first real firework, and again if the guest camera jumps to a new map.
			if (not anchor and #snap.items > 0) or jumped then plant_anchor(ply, snap) end
			local alive = {}
			for i = 1, #snap.items do
				local item = snap.items[i]
				alive[item.id] = true
				local pos = world_pos(item)
				if pos then
					if blocked[item.id] then pos = blocked[item.id] end
					local prev = trails[item.id] and trails[item.id][1]
					local hit = consider_hit(item, pos, prev)
					if not hit and not blocked[item.id] and item.state == 0 then
						local bumper = prop_bump(pos)
						if bumper then hit = { HitPos = pos, Entity = bumper } end
					end
					if hit and not blocked[item.id] then
						local hitPos = hit.HitPos or pos
						if item.kind == 1 then
							local dir = prev and (hitPos - prev) or Vector(0, 0, 1)
							local speed = dir:Length()
							if speed < 1 then dir = Vector(0, 0, 1) else dir:Normalize() end
							remember_hit(item, hitPos, dir, hit.Entity, math.Clamp(240 + speed * 6, 240, 680))
							pos = hitPos
						elseif not boomed[item.id] then
							boomed[item.id] = true
							boom(hitPos, Vector(0, 0, 1), hit.Entity, 280)
						end
					end
					if item.state == 1 and not boomed[item.id] then
						boomed[item.id] = true
						boom(pos, Vector(0, 0, 1), nil, 300)
					end
					local list = trails[item.id]
					if not list then
						list = {}
						trails[item.id] = list
					end
					table.insert(list, 1, pos)
					if #list > 8 then list[9] = nil end
				end
			end
			for id, h in pairs(stuck) do
				if not alive[id] then
					stuck[id] = nil
					blocked[id] = nil
				else
					hits[#hits + 1] = { id = id, kind = h.kind, x = h.x, y = h.y, z = h.z }
				end
			end
		end
		write_hits(hits)
		if CurTime() - lastLog > 1 then
			lastLog = CurTime()
			local cam = snap and snap.flags and bit.band(snap.flags, 1) or 0
			status = string.format(
				"Shellbox  seq %d  tick %d  shells %d  meshes %d  particles %d  catalog %d  %s",
				snap and snap.seq or 0,
				snap and snap.tick or 0,
				snap and #snap.items or 0,
				geom and geom.meshCount or 0,
				geom and geom.particleCount or 0,
				#catalog,
				(not snap) and "no snapshot" or stale and "stale" or (cam == 1 and (anchor and "planted" or "live") or "no camera")
			)
			file.CreateDir("shellbox")
			file.Write("shellbox/host.txt", status .. "\n")
			print(status)
		end
	end)
	if not ok then
		status = "Shellbox error: " .. tostring(err)
	end
end)

local function seen_from(ply, pos)
	local tr = trace_world(ply:EyePos(), pos)
	return (not tr.Hit) or tr.HitSky or tr.Fraction > 0.97
end

hook.Add("PostDrawTranslucentRenderables", "shellbox", function(_, sky)
	if sky or not snap or not anchor then return end
	if CurTime() - lastTickAt > 1 then return end
	if bit.band(snap.flags, 1) ~= 1 then return end
	local ply = LocalPlayer()
	if not IsValid(ply) then return end
	render.OverrideDepthEnable(true, false)
	cam.IgnoreZ(false)
	local lights = 0
	for i = 1, #snap.items do
		local item = snap.items[i]
		local pos = blocked[item.id] or world_pos(item)
		if pos then
			local col = Color(item.r, item.g, item.b, 255)
			local size = math.max(36, (item.radius or 0.25) * SCALE * 6)
			if item.kind == 8 then size = 28 end
			if item.state == 1 or blocked[item.id] then size = size * 2 end
			if seen_from(ply, pos) then
				if not geom_live() then
					render.SetMaterial(glow)
					render.DrawSprite(pos, size, size, col)
				end
				if lights < 4 and item.state == 0 and not blocked[item.id] then
					lights = lights + 1
					local dl = DynamicLight(0x5100 + lights)
					if dl then
						dl.pos = pos
						dl.r = item.r
						dl.g = item.g
						dl.b = item.b
						dl.brightness = 2
						dl.decay = 800
						dl.size = 220
						dl.dietime = CurTime() + 0.1
					end
				end
			end
		end
	end
	if geom_live() then
		local map = mapper()
		if map then
			local drawn = 0
			for i = 1, #geom.parts do
				if drawn >= 1000 then break end
				local p = geom.parts[i]
				local pos = map(p[1], p[2], p[3])
				local sz = math.Clamp((p[4] or 0.2) * SCALE, 8, 700)
				render.SetMaterial(glow)
				render.DrawSprite(pos, sz, sz, Color(p[5] or 255, p[6] or 255, p[7] or 255, p[8] or 255))
				drawn = drawn + 1
			end
		end
	end
	render.OverrideDepthEnable(false, false)
end)

hook.Add("PostDrawOpaqueRenderables", "shellbox_mesh", function(depth, sky)
	if depth or sky or not geom_live() or not anchor then return end
	local map = mapper()
	if not map then return end
	render.OverrideDepthEnable(true, true)
	for m = 1, #geom.meshes do
		local info = geom.meshes[m]
		local list = {}
		for t = 1, info.triCount do
			local tri = geom.tris[info.triStart + t]
			if tri and geom.verts[tri[1]] and geom.verts[tri[2]] and geom.verts[tri[3]] then
				list[#list + 1] = tri
			end
		end
		if #list > 0 then
			render.SetMaterial(mat_for(info.tex))
			mesh.Begin(MATERIAL_TRIANGLES, #list)
			for t = 1, #list do
				local tri = list[t]
				local order = { tri[1], tri[3], tri[2] }
				for k = 1, 3 do
					local v = geom.verts[order[k]]
					mesh.Position(map(v[1], v[2], v[3]))
					mesh.Normal(Vector(0, 0, 1))
					mesh.TexCoord(0, v[4] or 0, v[5] or 0)
					mesh.Color(v[6] or 255, v[7] or 255, v[8] or 255, v[9] or 255)
					mesh.AdvanceVertex()
				end
			end
			mesh.End()
		end
	end
	render.OverrideDepthEnable(false, false)
end)

hook.Add("HUDPaint", "shellbox", function()
	draw.SimpleText(status, "Trebuchet24", 24, 24, color_white, TEXT_ALIGN_LEFT, TEXT_ALIGN_TOP)
	local hint = "Hold Alt. Click a firework, or press 1-9. It spawns on your crosshair and lights."
	if #catalog == 0 then
		hint = "Waiting for the firework list from Fireworks Mania."
	end
	draw.SimpleText(hint, "DermaDefault", 24, 52, color_white, TEXT_ALIGN_LEFT, TEXT_ALIGN_TOP)
	if spawnNote ~= "" and CurTime() < spawnNoteUntil then
		draw.SimpleText(spawnNote, "DermaDefault", 24, 68, Color(255, 210, 120), TEXT_ALIGN_LEFT, TEXT_ALIGN_TOP)
	end
	layout_catalog()
	local mx, my = gui.MouseX(), gui.MouseY()
	for i = 1, #rows do
		local w = rows[i]
		local hot = mx >= w.x and my >= w.y and mx <= w.x + w.w and my <= w.y + w.h
		local col = Color(16, 18, 28, 220)
		if w.kind == "type" then col = Color(28, 32, 48, 230) end
		if hot then col = Color(92, 58, 16, 235) end
		draw.RoundedBox(4, w.x, w.y, w.w, w.h, col)
		local label = w.label
		if w.slot then label = tostring(w.slot) .. "  " .. label end
		draw.SimpleText(label, "DermaDefault", w.x + 8, w.y + w.h * 0.5, color_white, TEXT_ALIGN_LEFT, TEXT_ALIGN_CENTER)
	end
end)

concommand.Add("shellbox_status", function()
	print(status)
end)

concommand.Add("shellbox_plant", function()
	anchor = nil
	blocked = {}
	stuck = {}
	trails = {}
	print("Shellbox replanting at your eyes")
end)
