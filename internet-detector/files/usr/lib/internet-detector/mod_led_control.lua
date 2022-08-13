
local nixio  = require("nixio")

local Module = {
	name                  = "mod_led_control",
	config                = {},
	syslog                = function(level, msg) return true end,
	writeValue            = function(filePath, str) return false end,
	readValue             = function(filePath) return nil end,
	runInterval           = 5,
	sysLedsDir            = "/sys/class/leds",
	ledName               = nil,
	status                = nil,
	_enabled              = false,
	_ledDir               = nil,
	_ledMaxBrightnessFile = nil,
	_ledBrightnessFile    = nil,
	_ledMaxBrightness     = nil,
	_counter              = 0,
}

function Module:resetLeds()
	local dir = nixio.fs.dir(self.sysLedsDir)
	if not dir then
		return
	end
	for led in dir do
		local brightness = string.format("%s/%s/brightness", self.sysLedsDir, led)
		if nixio.fs.access(brightness, "w") then
			self.writeValue(brightness, 0)
		end
	end
end

function Module:init(t)
	self.ledName = t.led_name
	if not self.ledName then
		return
	end
	self._ledDir               = string.format("%s/%s", self.sysLedsDir, self.ledName)
	self._ledMaxBrightnessFile = string.format("%s/max_brightness", self._ledDir)
	self._ledBrightnessFile    = string.format("%s/brightness", self._ledDir)
	self._ledMaxBrightness     = self.readValue(self._ledMaxBrightnessFile) or 1
	if (not nixio.fs.access(self._ledDir, "r") or
	    not nixio.fs.access(self._ledBrightnessFile, "r", "w")) then
		self._enabled = false
		self.syslog("warning", string.format("%s: LED '%s' is not available", self.name, self.ledName))
	else
		self._enabled = true
		-- Reset all LEDs
		--self:resetLeds()
	end
end

function Module:getCurrentState()
	local state = self.readValue(self._ledBrightnessFile)
	if state and tonumber(state) > 0 then
		return tonumber(state)
	end
end

function Module:on()
	self.writeValue(self._ledBrightnessFile, self._ledMaxBrightness)
end

function Module:off()
	self.writeValue(self._ledBrightnessFile, 0)
end

function Module:run(currentStatus, lastStatus, timeDiff)
	if not self._enabled then
		return
	end
	if self._counter == 0 or self._counter >= self.runInterval or currentStatus ~= lastStatus then

		if currentStatus == 0 then
			if not self:getCurrentState() then
				self:on()
			end
		else
			if self:getCurrentState() then
				self:off()
			end
		end

		self._counter = 0
	end
	self._counter = self._counter + timeDiff
end

return Module
