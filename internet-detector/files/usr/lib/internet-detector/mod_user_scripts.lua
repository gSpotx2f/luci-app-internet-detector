
local nixio  = require("nixio")

local Module = {
	name                = "mod_user_scripts",
	config              = {},
	syslog              = function(level, msg) return true end,
	writeValue          = function(filePath, str) return false end,
	readValue           = function(filePath) return nil end,
	deadPeriod          = 0,
	alivePeriod         = 0,
	upScript            = "",
	downScript          = "",
	status              = nil,
	_deadCounter        = 0,
	_aliveCounter       = 0,
	_upScriptExecuted   = true,
	_downScriptExecuted = true,
}

function Module:runExternalScript(scriptPath)
	if nixio.fs.access(scriptPath, "x") then
		os.execute(string.format('/bin/sh -c "%s" &', scriptPath))
	end
end

function Module:init(t)
	self.deadPeriod  = tonumber(t.dead_period)
	self.alivePeriod = tonumber(t.alive_period)
	if self.config.configDir then
		self.upScript   = string.format("%s/up-script", self.config.configDir)
		self.downScript = string.format("%s/down-script", self.config.configDir)
	end
end

function Module:run(currentStatus, lastStatus, timeDiff)
	if currentStatus == 1 then
		self._aliveCounter       = 0
		self._downScriptExecuted = false

		if not self._upScriptExecuted then
			if self._deadCounter >= self.deadPeriod then
				self:runExternalScript(self.downScript)
				self._upScriptExecuted = true
			else
				self._deadCounter = self._deadCounter + timeDiff
			end
		end
	else
		self._deadCounter      = 0
		self._upScriptExecuted = false

		if not self._downScriptExecuted then
			if self._aliveCounter >= self.alivePeriod then
				self:runExternalScript(self.upScript)
				self._downScriptExecuted = true
			else
				self._aliveCounter = self._aliveCounter + timeDiff
			end
		end
	end
end

return Module
