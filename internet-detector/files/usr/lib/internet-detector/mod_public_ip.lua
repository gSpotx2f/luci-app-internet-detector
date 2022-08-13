
local nixio  = require("nixio")

local Module = {
	name         = "mod_public_ip",
	config       = {},
	syslog       = function(level, msg) return true end,
	writeValue   = function(filePath, str) return false end,
	readValue    = function(filePath) return nil end,
	runInterval  = 600,
	nslookup     = "/usr/bin/nslookup",
	timeout      = 3,
	providers    = {
		opendns1 = {
			name = "opendns1", server = "208.67.222.222",
			host = "myip.opendns.com", queryType = "a"
		},
		opendns2 = {
			name = "opendns2", server = "208.67.220.220",
			host = "myip.opendns.com", queryType = "a"
		},
		opendns3 = {
			name = "opendns3", server = "208.67.222.220",
			host = "myip.opendns.com", queryType = "a"
		},
		opendns4 = {
			name = "opendns4", server = "208.67.220.222",
			host = "myip.opendns.com", queryType = "a"
		},
		akamai   = {
			name = "akamai", server = "ns1-1.akamaitech.net",
			host = "whoami.akamai.net", queryType = "a"
		},
		google   = {
			name = "google", server = "ns1.google.com",
			host = "o-o.myaddr.l.google.com", queryType = "txt"
		},
	},
	status       = nil,
	_provider    = nil,
	_nslookupCmd = nil,
	_currentIp   = nil,
	_enabled     = false,
	_counter     = 0,
}

function Module:parseA(str)
	res = str:match("Name:%s+" .. self._provider.host .. "\nAddress:%s+[%w.:]+")
	if res then
		return res:match("[%w.:]+$")
	end
end

function Module:parseGoogle(str)
	res = str:match(self._provider.host .. '%s+text%s+=%s+"[%w.:]+"')
	if res then
		return res:gsub('"', ''):match("[%w.:]+$")
	end
end

function Module:resolveIP()
	local res
	local fh = io.popen(self._nslookupCmd, "r")
	if fh then
		output = fh:read("*a")
		fh:close()
		if self._provider.name == "google" then
			res = self:parseGoogle(output)
		else
			res = self:parseA(output)
		end
	else
		self.syslog("err", string.format(
			"%s: Nslookup call failed (%s)", self.name, self.nslookup))
	end
	return res or "Undefined"
end

function Module:init(t)
	if t.interval then
		self.runInterval = tonumber(t.interval)
	end
	if t.timeout then
		self.timeout = tonumber(t.timeout)
	end
	if t.provider then
		self._provider = self.providers[t.provider]
	else
		self._provider = self.providers.opendns1
	end
	if not nixio.fs.access(self.nslookup, "x") then
		self._enabled = false
		self.syslog(
			"warning",
			string.format("%s: '%s' does not exists", self.name, self.nslookup)
		)
	else
		self._enabled     = true
		self._nslookupCmd = string.format(
			"%s -type=%s -timeout=%d %s %s",
			self.nslookup,
			self._provider.queryType,
			self.timeout,
			self._provider.host,
			self._provider.server
		)
	end
end

function Module:run(currentStatus, lastStatus, timeDiff)
	if not self._enabled then
		return
	end
	if currentStatus == 0 then
		if self._counter == 0 or self._counter >= self.runInterval or currentStatus ~= lastStatus then
			local ip = self:resolveIP()
			if ip ~= self._currentIp then
				self.status = ip
				self.syslog(
					"notice",
					string.format("%s: public IP address %s", self.name, ip)
				)
			else
				self.status = nil
			end
			self._currentIp = ip
			self._counter   = 0
		else
			self.status = nil
		end
	else
		self.status     = nil
		self._currentIp = nil
		self._counter   = 0
	end
	self._counter = self._counter + timeDiff
end

return Module
