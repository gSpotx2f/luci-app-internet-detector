
local stdlib = require("posix.stdlib")
local unistd = require("posix.unistd")

local Module = {
	name        = "mod_regular_script",
	runPrio     = 90,
	config      = {},
	syslog      = function(level, msg) return true end,
	writeValue  = function(filePath, str) return false end,
	readValue   = function(filePath) return nil end,
	inetState   = 2,		-- 0: connected, 1: disconnected, 2: both
	runInterval = 3600,
	script      = "",
	status      = nil,
	_nextTime   = nil,
}

function Module:runExternalScript(scriptPath, currentStatus)
	if unistd.access(scriptPath, "r") then
		stdlib.setenv("INET_STATE", currentStatus)
		os.execute(string.format('/bin/sh "%s" &', scriptPath))
	end
end

function Module:init(t)
	if t.inet_state ~= nil then
		self.inetState = tonumber(t.inet_state)
	end
	if t.interval ~= nil then
		self.runInterval = tonumber(t.interval)
	end
	if self.config.configDir then
		self.script = string.format(
			"%s/regular-script.%s", self.config.configDir, self.config.serviceConfig.instance)
	end
end

function Module:run(currentStatus, lastStatus, timeDiff, timeNow)
	if not self._nextTime then
		if timeNow < self.runInterval then
			self._nextTime = self.runInterval
		else
			self._nextTime = timeNow - (timeNow % self.runInterval) + self.runInterval
		end
	end
	if timeNow >= self._nextTime then
		if self.inetState == 2 or (self.inetState == 0 and currentStatus == 0) or (self.inetState == 1 and currentStatus == 1) then
			self:runExternalScript(self.script, currentStatus)
		end
		self._nextTime = self._nextTime + self.runInterval
	end
end

return Module
