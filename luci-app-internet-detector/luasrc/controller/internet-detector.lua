
module('luci.controller.internet-detector', package.seeall)

function index()
	if nixio.fs.access('/usr/bin/internet-detector', 'x') then
		entry({'admin', 'services', 'internet-detector'}, view('internet-detector'), _('Internet detector'), 10).acl_depends = { 'luci-app-internet-detector' }
	end
end
