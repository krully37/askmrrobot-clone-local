local addonName = ...
LocalSimDashCatalogDB = LocalSimDashCatalogDB or { schema = 1, records = {}, diagnostics = {} }
local DB = LocalSimDashCatalogDB
local activeMplus = { source = nil, track = nil }
local activeContext = { category = nil, source = nil, track = nil, boss = nil }
local scanQueue, scanning = {}, false

local function chat(message) print("|cff4ee0b8Local Sim Catalog:|r " .. message) end
local function split(value, separator)
  local rows = {}
  for part in (value .. separator):gmatch("(.-)" .. separator) do table.insert(rows, part) end
  return rows
end
local function buildInfo() local version, build = GetBuildInfo(); return version .. " (" .. tostring(build) .. ")" end
local function itemFields(link)
  if not link then return nil end
  local itemString = link:match("|Hitem:([^|]+)|h")
  if not itemString then return nil end
  local parts = split(itemString, ":"); local itemId = tonumber(parts[1]); local count = tonumber(parts[13]) or 0; local bonusIds = {}
  for index = 1, count do local value = tonumber(parts[13 + index]); if value then table.insert(bonusIds, value) end end
  local itemLevel = C_Item and C_Item.GetDetailedItemLevelInfo and C_Item.GetDetailedItemLevelInfo(link) or nil
  return itemId, itemLevel, bonusIds
end
local function addRecord(record)
  local key = table.concat({ record.source or "", record.boss or "", record.difficulty or "", record.track or "", record.itemId or "" }, "|")
  DB.records[key] = record
end
local function escape(value)
  local text = tostring(value or ""):gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\r', '\\r'):gsub('\n', '\\n'):gsub('\t', '\\t')
  text = text:gsub('[%z\1-\8\11\12\14-\31]', function(character) return string.format('\\u%04x', string.byte(character)) end)
  return '"' .. text .. '"'
end
local function colorHex(color)
  if type(color) ~= "table" then return nil end
  local r, g, b = color.r or color[1], color.g or color[2], color.b or color[3]
  if not r or not g or not b then return nil end
  return string.format("#%02x%02x%02x", math.floor(r * 255), math.floor(g * 255), math.floor(b * 255))
end
local function tooltipFor(link)
  local info = C_TooltipInfo and C_TooltipInfo.GetHyperlink and C_TooltipInfo.GetHyperlink(link)
  local lines, name, quality = {}, nil, nil
  if C_Item and C_Item.GetItemInfo then name, _, quality = C_Item.GetItemInfo(link) end
  for _, line in ipairs((info and info.lines) or {}) do
    local left, right = line.leftText or line.text, line.rightText
    if left or right then table.insert(lines, { left = left, right = right, kind = line.type, leftColor = colorHex(line.leftColor), rightColor = colorHex(line.rightColor) }) end
  end
  return { name = name, quality = quality, lines = lines }
end
local function tooltipJson(tooltip)
  if not tooltip or not tooltip.lines or #tooltip.lines == 0 then return "null" end
  local lines = {}
  for _, line in ipairs(tooltip.lines) do
    table.insert(lines, "{" .. table.concat({ '"left":'..escape(line.left), '"right":'..escape(line.right), '"kind":'..escape(line.kind), '"leftColor":'..escape(line.leftColor), '"rightColor":'..escape(line.rightColor) }, ",") .. "}")
  end
  return "{" .. table.concat({ '"name":'..escape(tooltip.name), '"quality":'..tostring(tonumber(tooltip.quality) or 0), '"lines":['..table.concat(lines, ',')..']' }, ",") .. "}"
end
local function payload()
  local rows = {}; for _, record in pairs(DB.records or {}) do
    local bonuses = {}; for _, bonus in ipairs(record.bonusIds or {}) do table.insert(bonuses, tostring(bonus)) end
    table.insert(rows, "{" .. table.concat({ '"source":'..escape(record.source), '"boss":'..escape(record.boss), '"category":'..escape(record.category), '"difficulty":'..escape(record.difficulty), '"track":'..escape(record.track), '"itemId":'..tostring(record.itemId), '"itemLevel":'..tostring(record.itemLevel), '"bonusIds":['..table.concat(bonuses, ',')..']', '"itemLink":'..escape(record.itemLink), '"tooltip":'..tooltipJson(record.tooltip), '"capturedAt":'..escape(record.capturedAt), '"clientBuild":'..escape(record.clientBuild) }, ",") .. "}")
  end
  return '{"schema":1,"season":'..escape(LocalSimDashCatalogManifest.season)..',"clientBuild":'..escape(buildInfo())..',"records":['..table.concat(rows, ',')..']}'
end
local alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
local function base64url(value)
  local out = {}
  for index = 1, #value, 3 do
    local a = value:byte(index) or 0
    local b = value:byte(index + 1)
    local c = value:byte(index + 2)
    local number = a * 65536 + (b or 0) * 256 + (c or 0)
    table.insert(out, alphabet:sub(math.floor(number / 262144) % 64 + 1, math.floor(number / 262144) % 64 + 1))
    table.insert(out, alphabet:sub(math.floor(number / 4096) % 64 + 1, math.floor(number / 4096) % 64 + 1))
    if b then table.insert(out, alphabet:sub(math.floor(number / 64) % 64 + 1, math.floor(number / 64) % 64 + 1)) end
    if c then table.insert(out, alphabet:sub(number % 64 + 1, number % 64 + 1)) end
  end
  return table.concat(out)
end
local function adler32(value) local a, b = 1, 0; for index=1,#value do a=(a+value:byte(index))%65521; b=(b+a)%65521 end; return string.format('%08x', b*65536+a) end
local function exportPayload()
  local body=payload(); local token='LSDC1.'..base64url(body)..'.'..adler32(body); DB.payload=token
  StaticPopupDialogs['LOCALSIMDASH_EXPORT']={text='Copy this Local Sim Dashboard capture export:',button1='Close',hasEditBox=1,editBoxWidth=620,timeout=0,whileDead=1,hideOnEscape=1,OnShow=function(self) local box=self.EditBox or self.editBox; if box then box:SetText(token); box:HighlightText(); box:SetFocus() end end}; StaticPopup_Show('LOCALSIMDASH_EXPORT')
  chat('Export ready. Copy it into Catalog → Import addon capture, or /reload for automatic SavedVariables import.')
end
local function findInstance(name, isRaid)
  local wanted = name:lower():gsub("[^%w]", "")
  for _, mode in ipairs({ isRaid, not isRaid }) do
    for index = 1, 200 do
      local id, found = EJ_GetInstanceByIndex(index, mode)
      if not id then break end
      if found and (found == name or found:lower():gsub("[^%w]", "") == wanted) then return id end
    end
  end
end
local function lootInfo(index)
  if C_EncounterJournal and C_EncounterJournal.GetLootInfoByIndex then
    local info = C_EncounterJournal.GetLootInfoByIndex(index)
    if info then return info.itemID or info.itemId, info.name, info.iconFileID or info.icon, info.link or info.itemLink end
  elseif EJ_GetLootInfoByIndex then
    local itemId, _, itemName, icon, _, _, link = EJ_GetLootInfoByIndex(index)
    return itemId, itemName, icon, link
  end
end
local function captureLoot(source, boss, difficulty)
  local count = EJ_GetNumLoot() or 0
  local captured, pending = 0, false
  for index = 1, count do
    local itemId, itemName, icon, link = lootInfo(index)
    local parsedId, itemLevel, bonusIds = itemFields(link)
    if itemId and parsedId == itemId and itemLevel and itemLevel > 0 then
      addRecord({ source = source, boss = boss, difficulty = difficulty, itemId = itemId, itemLevel = itemLevel, bonusIds = bonusIds, itemLink = link, icon = icon, tooltip = tooltipFor(link), capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"), clientBuild = buildInfo() })
      captured = captured + 1
    elseif itemId then
      pending = true
      if C_Item and C_Item.RequestLoadItemDataByID then C_Item.RequestLoadItemDataByID(itemId) end
    end
  end
  return captured, pending
end
local function nextScan()
  local job = table.remove(scanQueue, 1)
  if not job then scanning = false; exportPayload(); return end
  EJ_SelectInstance(job.instanceId); EJ_SetDifficulty(job.difficultyId); EJ_SelectEncounter(job.encounterId)
  local attempts = 0
  local function ready()
    attempts = attempts + 1
    if (EJ_GetNumLoot() or 0) > 0 then
      local captured, pending = captureLoot(job.source, job.boss, job.difficulty)
      if pending and attempts < 30 then C_Timer.After(0.15, ready)
      else
        if captured == 0 then table.insert(DB.diagnostics, { source = job.source, boss = job.boss, difficulty = job.difficulty, error = "Loot links/item levels were unavailable" }) end
        C_Timer.After(0.05, nextScan)
      end
    elseif attempts < 30 then C_Timer.After(0.10, ready)
    else table.insert(DB.diagnostics, { source = job.source, boss = job.boss, difficulty = job.difficulty, error = "Encounter Journal loot data timed out" }); C_Timer.After(0.05, nextScan) end
  end
  C_Timer.After(0.10, ready)
end
local function queueInstance(source, instanceId)
  local added = 0
  for encounterIndex = 1, 99 do
    local boss, _, encounterId = EJ_GetEncounterInfoByIndex(encounterIndex, instanceId)
    if not encounterId then break end
    for difficulty, difficultyId in pairs(source.difficulties) do
      if difficulty ~= "Mythic+" then
        table.insert(scanQueue, { source = source.name, boss = boss, instanceId = instanceId, encounterId = encounterId, difficulty = difficulty, difficultyId = difficultyId })
        added = added + 1
      end
    end
  end
  return added
end
local function scanAll()
  if InCombatLockdown() then chat("Leave combat before scanning."); return end
  local loaded = (C_AddOns and C_AddOns.IsAddOnLoaded and C_AddOns.IsAddOnLoaded("Blizzard_EncounterJournal")) or (IsAddOnLoaded and IsAddOnLoaded("Blizzard_EncounterJournal"))
  if not loaded then
    local ok, reason
    if C_AddOns and C_AddOns.LoadAddOn then
      ok, reason = C_AddOns.LoadAddOn("Blizzard_EncounterJournal")
    elseif UIParentLoadAddOn then
      ok, reason = UIParentLoadAddOn("Blizzard_EncounterJournal")
    else
      chat("The Encounter Journal loader is unavailable in this WoW client.")
      return
    end
    if not ok then
      chat("Could not load Blizzard_EncounterJournal" .. (reason and (": " .. tostring(reason)) or "."))
      return
    end
  end
  if not EJ_GetInstanceByIndex or not EJ_SelectInstance then chat("Encounter Journal APIs are unavailable after loading. Open the Adventure Guide once, then try again."); return end
  scanQueue = {}; DB.diagnostics = {}
  for _, source in ipairs(LocalSimDashCatalogManifest.sources) do
    if source.kind == "raid" or source.kind == "lair" then
      local instanceId = findInstance(source.name, source.kind == "raid")
      if instanceId then
        queueInstance(source, instanceId)
      else table.insert(DB.diagnostics, { source = source.name, error = "Journal instance not found" }) end
    end
  end
  if #scanQueue == 0 then chat("No pinned Journal sources matched this client. Open the desired instance in the Adventure Guide and use /lsdscan current."); return end
  scanning = true; nextScan(); chat("Scanning " .. tostring(#scanQueue) .. " Encounter Journal entries.")
end
local function scanCurrent()
  if InCombatLockdown() then chat("Leave combat before scanning."); return end
  if not EJ_GetEncounterInfoByIndex then chat("Open the Adventure Guide to the desired raid or lair first."); return end
  local name, _, firstEncounter, _, _, instanceId = EJ_GetEncounterInfoByIndex(1)
  if not firstEncounter or not instanceId then chat("Select an Encounter Journal instance with bosses, then run /lsdscan current."); return end
  local instanceName = EJ_GetInstanceInfo() or "Current Encounter Journal"
  local source = nil
  for _, candidate in ipairs(LocalSimDashCatalogManifest.sources) do if candidate.name == instanceName then source = candidate; break end end
  source = source or { name = instanceName, kind = "raid", difficulties = { ["Raid Finder"] = 17, Normal = 14, Heroic = 15, Mythic = 16 } }
  scanQueue = {}; DB.diagnostics = {}
  local count = queueInstance(source, instanceId)
  if count == 0 then chat("The selected Journal instance returned no encounters. Try opening its Overview page, then retry."); return end
  scanning = true; nextScan(); chat("Scanning current Journal source " .. instanceName .. " (" .. tostring(count) .. " entries).")
end
local function captureMplus(link)
  if not activeMplus.source or not activeMplus.track then chat("Set M+ context first: /lsdmplus Source Name|+10"); return end
  local itemId, itemLevel, bonusIds = itemFields(link)
  if not itemId or not itemLevel then chat("Shift-click a live item link after /lsdcapture."); return end
  addRecord({ source = activeMplus.source, difficulty = "Mythic+", track = activeMplus.track, itemId = itemId, itemLevel = itemLevel, bonusIds = bonusIds, itemLink = link, tooltip = tooltipFor(link), capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"), clientBuild = buildInfo() }); chat("Captured " .. tostring(itemId) .. " for " .. activeMplus.source .. " " .. activeMplus.track)
end
local function captureContext(link)
  if not activeContext.category or not activeContext.source or not activeContext.track then chat("Set context first: /lsdcontext Category|Source|Track|Optional Boss"); return end
  local itemId, itemLevel, bonusIds = itemFields(link)
  if not itemId or not itemLevel then chat("Shift-click a live item link after /lsdcapture."); return end
  addRecord({ category = activeContext.category, source = activeContext.source, boss = activeContext.boss, difficulty = activeContext.category, track = activeContext.track, itemId = itemId, itemLevel = itemLevel, bonusIds = bonusIds, itemLink = link, tooltip = tooltipFor(link), capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"), clientBuild = buildInfo() })
  chat("Captured " .. tostring(itemId) .. " for " .. activeContext.category .. " " .. activeContext.source .. " " .. activeContext.track)
end
local function captureInventoryLink(link, track)
  local itemId, itemLevel, bonusIds = itemFields(link)
  if not itemId or not itemLevel then return false end
  addRecord({ category = "inventory", source = "Player inventory", difficulty = "inventory", track = track, itemId = itemId, itemLevel = itemLevel, bonusIds = bonusIds, itemLink = link, tooltip = tooltipFor(link), capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"), clientBuild = buildInfo() })
  return true
end
local function captureTooltips()
  if InCombatLockdown() then chat("Leave combat before capturing tooltips."); return end
  local captured = 0
  for slot = INVSLOT_FIRST_EQUIPPED or 1, INVSLOT_LAST_EQUIPPED or 19 do
    if captureInventoryLink(GetInventoryItemLink("player", slot), "equipped") then captured = captured + 1 end
  end
  if C_Container and C_Container.GetContainerNumSlots and C_Container.GetContainerItemLink then
    for bag = BACKPACK_CONTAINER or 0, NUM_BAG_SLOTS or 4 do
      for slot = 1, C_Container.GetContainerNumSlots(bag) do
        if captureInventoryLink(C_Container.GetContainerItemLink(bag, slot), "bags") then captured = captured + 1 end
      end
    end
  end
  exportPayload(); chat("Captured " .. tostring(captured) .. " equipped/bag item tooltips.")
end
SLASH_LOCALSIMCATALOG1 = "/lsdscan"; SlashCmdList.LOCALSIMCATALOG = function(message) if message:lower() == "all" then scanAll() elseif message:lower() == "current" then scanCurrent() else chat("Use /lsdscan all or /lsdscan current") end end
SLASH_LOCALSIMCATALOGSTATUS1 = "/lsdstatus"; SlashCmdList.LOCALSIMCATALOGSTATUS = function() chat((scanning and "Scan running" or "Idle") .. "; " .. tostring((function() local n=0; for _ in pairs(DB.records or {}) do n=n+1 end; return n end)()) .. " captured variants."); for _, entry in ipairs(DB.diagnostics or {}) do chat((entry.source or "Journal") .. ": " .. (entry.error or "no details")) end end
SLASH_LOCALSIMCATALOGEXPORT1 = "/lsdexport"; SlashCmdList.LOCALSIMCATALOGEXPORT = exportPayload
SLASH_LOCALSIMCATALOGMPLUS1 = "/lsdmplus"; SlashCmdList.LOCALSIMCATALOGMPLUS = function(message) local source, track = message:match("^(.-)|(.+)$"); activeMplus = { source = source, track = track }; chat(source and ("M+ context: " .. source .. " " .. track) or "Use /lsdmplus Source Name|+10") end
SLASH_LOCALSIMCATALOGCONTEXT1 = "/lsdcontext"; SlashCmdList.LOCALSIMCATALOGCONTEXT = function(message) local parts = split(message, "|"); local category, source, track, boss = parts[1], parts[2], parts[3], parts[4]; activeContext = { category = category, source = source, track = track, boss = boss }; chat(category and source and track and ("Context: " .. category .. " · " .. source .. " · " .. track) or "Use /lsdcontext Category|Source|Track|Optional Boss") end
SLASH_LOCALSIMCATALOGCAPTURE1 = "/lsdcapture"; SlashCmdList.LOCALSIMCATALOGCAPTURE = function(link) if activeContext.category then captureContext(link) else captureMplus(link) end end
SLASH_LOCALSIMCATALOGTOOLTIPS1 = "/lsdtooltips"; SlashCmdList.LOCALSIMCATALOGTOOLTIPS = captureTooltips
