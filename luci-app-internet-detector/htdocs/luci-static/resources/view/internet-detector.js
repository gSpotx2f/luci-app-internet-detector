'use strict';
'require form';
'require fs';
'require rpc';
'require uci';
'require ui';
'require tools.widgets as widgets'

const btnStyleEnabled  = 'btn cbi-button-save';
const btnStyleDisabled = 'btn cbi-button-reset';
const btnStyleApply    = 'btn cbi-button-apply';

var Timefield = ui.Textfield.extend({
	secToString: function(value) {
		let string = '0';
		if(/^\d+$/.test(value)) {
			value = Number(value);
			if(value >= 3600 && (value % 3600) === 0) {
				string = String(value / 3600) + 'h';
			}
			else if(value >= 60 && (value % 60) === 0) {
				string = String(value / 60) + 'm';
			}
			else {
				string = String(value) + 's';
			};
		};
		return string;
	},

	render: function() {
		let frameEl = E('div', { 'id': this.options.id }),
		    inputEl = E('input', {
			'id'         : this.options.id ? 'widget.' + this.options.id : null,
			'name'       : this.options.name,
			'type'       : 'text',
			'class'      : 'cbi-input-text',
			'readonly'   : this.options.readonly ? '' : null,
			'disabled'   : this.options.disabled ? '' : null,
			'maxlength'  : this.options.maxlength,
			'placeholder': this.options.placeholder,
			'value'      : this.secToString(this.value),
		});
		frameEl.appendChild(inputEl);
		return this.bind(frameEl);
	},

	getValue: function() {
		let rawValue = this.node.querySelector('input').value,
		    value    = 0,
		    res      = rawValue.match(/^(\d+)([hms]?)$/);
		if(res) {
			if(res[2] === 'h') {
				value = Number(res[1]) * 3600;
			}
			else if(res[2] === 'm') {
				value = Number(res[1]) * 60;
			}
			else if(!res[2] || res[2] === 's') {
				value = Number(res[1]);
			}
			else {
				value = 0;
			};
		} else {
			value = 0;
		};
		return String(value);
	},

	setValue: function(value) {
		let inputEl   = this.node.querySelector('input');
		inputEl.value = this.secToString(value);
	},
});

return L.view.extend({
	appName             : 'internet-detector',
	execPath            : '/usr/bin/internet-detector',
	upScriptPath        : '/etc/internet-detector/up-script',
	downScriptPath      : '/etc/internet-detector/down-script',
	ledsPath            : '/sys/class/leds',
	mtaPath             : '/usr/bin/mailsend',
	pollInterval        : L.env.pollinterval,
	appStatus           : 'stoped',
	initStatus          : null,
	inetStatus          : null,
	inetStatusLabel     : E('span', { 'class': 'label' }),
	inetStatusSpinner   : E('span', { 'class': 'spinning', 'style': 'margin-top:1em' }, ' '),
	serviceStatusLabel  : E('em'),
	serviceButton       : null,
	initButton          : null,
	uiPollCounter       : 0,
	uiPollState         : null,
	uiCheckIntervalUp   : null,
	uiCheckIntervalDown : null,
	currentAppMode      : '0',
	leds                : [],
	mm                  : false,
	mta                 : false,

	callInitStatus: rpc.declare({
		object: 'luci',
		method: 'getInitList',
		params: [ 'name' ],
		expect: { '': {} }
	}),

	callInitAction: rpc.declare({
		object: 'luci',
		method: 'setInitAction',
		params: [ 'name', 'action' ],
		expect: { result: false }
	}),

	getInitStatus: function() {
		return this.callInitStatus(this.appName).then(res => {
			if(res) {
				return res[this.appName].enabled;
			} else {
				throw _('Command failed');
			}
		}).catch(e => {
			ui.addNotification(null,
				E('p', _('Failed to get %s init status: %s').format(this.appName, e)));
		});
	},

	handleServiceAction: function(action) {
		return this.callInitAction(this.appName, action).then(success => {
			if(!success) {
				throw _('Command failed');
			};
			return true;
		}).catch(e => {
			ui.addNotification(null,
				E('p', _('Service action failed "%s %s": %s').format(this.appName, action, e)));
		});
	},

	serviceRestart: function(ev) {
		L.Poll.stop();
		return this.handleServiceAction('restart').then(() => {
			window.setTimeout(() => this.servicePoll(), 1000);
			L.Poll.start();
		});
	},

	CBITimeInput: form.Value.extend({
		__name__ : 'CBI.TimeInput',

		renderWidget: function(section_id, option_index, cfgvalue) {
			let value  = (cfgvalue != null) ? cfgvalue : this.default,
				widget = new Timefield(value, {
				id         : this.cbid(section_id),
				optional   : this.optional || this.rmempty,
				maxlength  : 3,
				placeholder: _('Type a time string'),
				validate   : L.bind(
					function(section, value) {
						return (/^$|^\d+[hms]?$/.test(value)) ? true : _('Expecting:') +
							` ${_('One of the following:')}\n - ${_('hours')}: 2h\n - ${_('minutes')}: 10m\n - ${_('seconds')}: 30s\n`;
					},
					this,
					section_id
				),
				disabled   : (this.readonly != null) ? this.readonly : this.map.readonly,
			});
			return widget.render();
		},
	}),

	CBIBlockService: form.Value.extend({
		__name__    : 'CBI.BlockService',

		__init__    : function(map, section, ctx) {
			this.map      = map;
			this.section  = section;
			this.ctx      = ctx;
			this.optional = true;
			this.rmempty  = true;
		},

		renderWidget: function(section_id, option_index, cfgvalue) {
			this.ctx.serviceButton = E('button', {
				'class': btnStyleApply,
				'click': ui.createHandlerFn(this.ctx, this.ctx.serviceRestart),
			}, _('Restart'));
			this.ctx.initButton    = E('button', {
				'class': (!this.ctx.initStatus) ? btnStyleDisabled : btnStyleEnabled,
				'click': ui.createHandlerFn(this, () => {
					return this.ctx.handleServiceAction(
						(!this.ctx.initStatus) ? 'enable' : 'disable'
					).then(success => {
						if(!success) {
							return;
						};
						if(!this.ctx.initStatus) {
							this.ctx.initButton.textContent = _('Enabled');
							this.ctx.initButton.className   = btnStyleEnabled;
							this.ctx.initStatus             = true;
						}
						else {
							this.ctx.initButton.textContent = _('Disabled');
							this.ctx.initButton.className   = btnStyleDisabled;
							this.ctx.initStatus             = false;
						};
					});
				}),
			}, (!this.ctx.initStatus) ? _('Disabled') : _('Enabled'));

			this.ctx.setInternetStatus(true);

			let serviceItems = '';
			if(this.ctx.currentAppMode === '2') {
				serviceItems = E([
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' },
							_('Service')
						),
						E('div', { 'class': 'cbi-value-field' },
							this.ctx.serviceStatusLabel
						),
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' },
							_('Restart service')
						),
						E('div', { 'class': 'cbi-value-field' },
							this.ctx.serviceButton
						),
					]),
					E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' },
							_('Run service at startup')
						),
						E('div', { 'class': 'cbi-value-field' },
							this.ctx.initButton
						),
					]),
				]);
			};

			let internetStatus = (this.ctx.currentAppMode !== '0') ?
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' },
						_('Internet status')
					),
					E('div', { 'class': 'cbi-value-field' }, [
						this.ctx.inetStatusLabel,
						(!this.ctx.inetStatus) ? this.ctx.inetStatusSpinner : '',
					]),
				])
			: '';

			return E('div', { 'class': 'cbi-section' },
				E('div', { 'class': 'cbi-section-node' }, [
					internetStatus,
					serviceItems,
				])
			);
		},
	}),

	fileEditDialog: L.Class.extend({
		__init__: function(file, title, description, callback, fileExists=false) {
			this.file        = file;
			this.title       = title;
			this.description = description;
			this.callback    = callback;
			this.fileExists  = fileExists;
		},

		load: function() {
			return L.resolveDefault(fs.read(this.file), '');
		},

		render: function(content) {
			ui.showModal(this.title, [
				E('div', { 'class': 'cbi-section' }, [
					E('div', { 'class': 'cbi-section-descr' }, this.description),
					E('div', { 'class': 'cbi-section' },
						E('p', {},
							E('textarea', {
								'id': 'widget.modal_content',
								'class': 'cbi-input-textarea',
								'style': 'width:100% !important',
								'rows': 10,
								'wrap': 'off',
								'spellcheck': 'false',
							},
							content)
						)
					),
				]),
				E('div', { 'class': 'right' }, [
					E('button', {
						'class': 'btn',
						'click': ui.hideModal,
					}, _('Dismiss')),
					' ',
					E('button', {
						'id': 'btn_save',
						'class': 'btn cbi-button-positive important',
						'click': ui.createHandlerFn(this, this.handleSave),
					}, _('Save')),
				]),
			]);
		},

		handleSave: function(ev) {
			let textarea = document.getElementById('widget.modal_content');
			let value = textarea.value.trim().replace(/\r\n/g, '\n') + '\n';

			return fs.write(this.file, value).then(rc => {
				textarea.value = value;
				ui.addNotification(null, E('p', _('Contents have been saved.')),
					'info');
				if(this.callback) {
					return this.callback(rc);
				};
			}).catch(e => {
				ui.addNotification(null, E('p', _('Unable to save the contents')
					+ ': %s'.format(e.message)));
			}).finally(() => {
				ui.hideModal();
			});
		},

		error: function(e) {
			if(!this.fileExists && e instanceof Error && e.name === 'NotFoundError') {
				return this.render();
			} else {
				ui.showModal(this.title, [
					E('div', { 'class': 'cbi-section' },
						E('p', {}, _('Unable to read the contents')
							+ ': %s'.format(e.message))
					),
					E('div', { 'class': 'right' },
						E('button', {
							'class': 'btn',
							'click': ui.hideModal,
						}, _('Dismiss'))
					),
				]);
			};
		},

		show: function() {
			ui.showModal(null,
				E('p', { 'class': 'spinning' }, _('Loading'))
			);
			this.load().then(content => {
				ui.hideModal();
				return this.render(content);
			}).catch(e => {
				ui.hideModal();
				return this.error(e);
			})
		},
	}),

	setInternetStatus: function(initial=false) {
		if(this.inetStatus === 'up') {
			this.inetStatusLabel.style.background = '#46a546';
			this.inetStatusLabel.textContent = _('Connected');
		}
		else if(this.inetStatus === 'down') {
			this.inetStatusLabel.textContent = _('Disconnected');
			this.inetStatusLabel.style.background = '#ff6c74';
		}
		else {
			this.inetStatusLabel.textContent = _('Undefined');
			this.inetStatusLabel.style.background = '#cccccc';
		};

		if(!initial && this.inetStatusSpinner) {
			this.inetStatusSpinner.remove();
		};

		if(this.appStatus === 'running') {
			this.serviceStatusLabel.textContent = _('Running');
		} else {
			this.serviceStatusLabel.textContent = _('Stopped');
		};
	},

	servicePoll: function() {
		return Promise.all([
			fs.exec(this.execPath, [ 'status' ]),
			fs.exec(this.execPath, [ 'inet-status' ]),
		]).then(stat => {
			let curAppStatus  = (stat[0].code === 0) ? stat[0].stdout.trim() : null;
			let curInetStatus = (stat[1].code === 0) ? stat[1].stdout.trim() : null;
			if(this.inetStatus === curInetStatus && this.appStatus === curAppStatus) {
				return;
			};
			this.appStatus  = curAppStatus;
			this.inetStatus = curInetStatus;
			this.setInternetStatus();
		}).catch(e => {
			this.appStatus  = 'stoped';
			this.inetStatus = null;
		});
	},

	uiPoll: function() {
		let curInetStatus = null;
		this.uiPollCounter = ++this.uiPollCounter;

		if((this.uiPollState === 0 && this.uiPollCounter % this.uiCheckIntervalUp) ||
			(this.uiPollState === 1 && this.uiPollCounter % this.uiCheckIntervalDown)) {
			return;
		};

		this.uiPollCounter = 0;

		return fs.exec(this.execPath, [ 'inet-status' ]).then(res => {
			this.uiPollState = (res.code === 0 && res.stdout.trim() === 'up') ? 0 : 1;

			if(this.uiPollState === 0) {
				curInetStatus = 'up';
			} else {
				curInetStatus = 'down';
			};

			if(this.inetStatus !== curInetStatus) {
				this.inetStatus = (this.currentAppMode === '0') ? null : curInetStatus;
				this.setInternetStatus();
			};
		});
	},

	load: function() {
		return Promise.all([
			fs.exec(this.execPath, [ 'status' ]),
			this.getInitStatus(),
			L.resolveDefault(fs.list(this.ledsPath), []),
			this.callInitStatus('modemmanager'),
			L.resolveDefault(fs.stat(this.mtaPath), null),
			uci.load(this.appName),
		]).catch(e => {
			ui.addNotification(null, E('p', _('An error has occurred') + ': %s'.format(e.message)));
		});
	},

	render: function(data) {
		if(!data) {
			return;
		};
		this.appStatus           = (data[0].code === 0) ? data[0].stdout.trim() : null;
		this.initStatus          = data[1];
		this.leds                = data[2];
		if(data[3].modemmanager) {
			this.mm = true;
		};
		if(data[4]) {
			this.mta = true;
		};
		this.currentAppMode      = uci.get(this.appName, 'config', 'mode');
		this.uiCheckIntervalUp   = Number(uci.get(this.appName, 'config', 'ui_interval_up'));
		this.uiCheckIntervalDown = Number(uci.get(this.appName, 'config', 'ui_interval_down'));

		let s, o, ss;
		let m = new form.Map(this.appName,
			_('Internet detector'),
			_('Checking Internet availability.'));


		/* Service widget */

		s     = m.section(form.NamedSection, 'config', 'main');
		o     = s.option(this.CBIBlockService, this);


		/* Main settings */

		s     = m.section(form.NamedSection, 'config', 'main');

		s.tab('main_configuration', _('Main settings'));

		// mode
		let mode = s.taboption('main_configuration', form.ListValue,
			'mode', _('Internet detector mode'));
		mode.value('0', _('Disabled'));
		mode.value('1', _('Web UI only'));
		mode.value('2', _('Service'));
		mode.description = '%s<br />%s<br />%s'.format(
			_('Disabled: detector is completely off.'),
			_('Web UI only: detector works only when the Web UI is open (UI detector).'),
			_('Service: detector always runs as a system service.')
		);

		// hosts
		o = s.taboption('main_configuration', form.DynamicList,
			'hosts', _('Hosts'),
			_('Hosts to check Internet availability. Hosts are polled (in list order) until at least one of them responds.')
		);
		o.datatype = 'or(host,hostport)';

		// check_type
		o = s.taboption('main_configuration', form.ListValue,
			'check_type', _('Check type'),
			_('Host availability check type.')
		);
		o.value(0, _('TCP port connection'));
		o.value(1, _('Ping host'));

		// tcp_port
		o = s.taboption('main_configuration', form.Value,
			'tcp_port', _('TCP port'),
			_('Default port value for TCP connections.')
		);
		o.datatype = 'port';
		o.default  = '53';
		o.depends({ check_type: '0' });

		// ping_packet_size
		o = s.taboption('main_configuration', form.ListValue,
			'ping_packet_size', _('Ping packet size'));
		o.value(1,    _('Small: 1 byte'));
		o.value(32,   _('Windows: 32 bytes'));
		o.value(56,   _('Standard: 56 bytes'));
		o.value(248,  _('Big: 248 bytes'));
		o.value(1492, _('Huge: 1492 bytes'));
		o.value(9000, _('Jumbo: 9000 bytes'));
		o.default = '56';
		o.depends({ check_type: '1' });

		// iface
		o = s.taboption('main_configuration', widgets.DeviceSelect,
			'iface', _('Interface'),
			_('Network interface for Internet access. If not specified, the default interface is used.')
		);
		o.noaliases  = true;


		/* UI detector configuration */

		s.tab('ui_settings', _('UI detector configuration'));

		let makeUIIntervalOptions = L.bind(function(list) {
			list.value(1, '%d %s'.format(this.pollInterval, _('sec')));
			list.value(2, '%d %s'.format(this.pollInterval * 2, _('sec')));
			list.value(3, '%d %s'.format(this.pollInterval * 3, _('sec')));
			list.value(4, '%d %s'.format(this.pollInterval * 4, _('sec')));
			list.value(5, '%d %s'.format(this.pollInterval * 5, _('sec')));
			list.value(6, '%d %s'.format(this.pollInterval * 6, _('sec')));
		}, this);

		// interval_up
		o = s.taboption('ui_settings', form.ListValue,
			'ui_interval_up', _('Alive interval'),
			_('Hosts polling interval when the Internet is up.')
		);
		makeUIIntervalOptions(o);

		// interval_down
		o = s.taboption('ui_settings', form.ListValue,
			'ui_interval_down', _('Dead interval'),
			_('Hosts polling interval when the Internet is down.')
		);
		makeUIIntervalOptions(o);

		// connection_attempts
		o = s.taboption('ui_settings', form.ListValue,
			'ui_connection_attempts', _('Connection attempts'),
			_('Maximum number of attempts to connect to each host.')
		);
		o.value(1);
		o.value(2);
		o.value(3);

		// connection_timeout
		o = s.taboption('ui_settings', form.ListValue,
			'ui_connection_timeout', _('Connection timeout'),
			_('Maximum timeout for waiting for a response from the host.')
		);
		o.value(1, '1 ' + _('sec'));
		o.value(2, '2 ' + _('sec'));
		o.value(3, '3 ' + _('sec'));


		/* Service configuration */

		s.tab('service_settings', _('Service configuration'));

		function makeIntervalOptions(list) {
			list.value(2,   '2 '  + _('sec'));
			list.value(5,   '5 '  + _('sec'));
			list.value(10,  '10 ' + _('sec'));
			list.value(15,  '15 ' + _('sec'));
			list.value(20,  '20 ' + _('sec'));
			list.value(25,  '25 ' + _('sec'));
			list.value(30,  '30 ' + _('sec'));
			list.value(60,  '1 '  + _('min'));
			list.value(120, '2 '  + _('min'));
			list.value(300, '5 '  + _('min'));
			list.value(600, '10 ' + _('min'));
		}

		// interval_up
		o = s.taboption('service_settings', form.ListValue,
			'service_interval_up', _('Alive interval'),
			_('Hosts polling interval when the Internet is up.')
		);
		makeIntervalOptions(o);

		// interval_down
		o = s.taboption('service_settings', form.ListValue,
			'service_interval_down', _('Dead interval'),
			_('Hosts polling interval when the Internet is down.')
		);
		makeIntervalOptions(o);

		// connection_attempts
		o = s.taboption('service_settings', form.ListValue,
			'service_connection_attempts', _('Connection attempts'),
			_('Maximum number of attempts to connect to each host.')
		);
		o.value(1);
		o.value(2);
		o.value(3);
		o.value(4);
		o.value(5);

		// connection_timeout
		o = s.taboption('service_settings', form.ListValue,
			'service_connection_timeout', _('Connection timeout'),
			_('Maximum timeout for waiting for a response from the host.')
		);
		o.value(1,  '1 ' + _('sec'));
		o.value(2,  '2 ' + _('sec'));
		o.value(3,  '3 ' + _('sec'));
		o.value(4,  '4 ' + _('sec'));
		o.value(5,  '5 ' + _('sec'));
		o.value(6,  '6 ' + _('sec'));
		o.value(7,  '7 ' + _('sec'));
		o.value(8,  '8 ' + _('sec'));
		o.value(9,  '9 ' + _('sec'));
		o.value(10, '10 ' + _('sec'));

		// enable_logger
		o = s.taboption('service_settings', form.Flag,
			'service_enable_logger', _('Enable logging'),
			_('Write messages to the system log.')
		);
		o.rmempty = false;


		/* Modules */

		s = m.section(form.NamedSection, 'config', 'main',
			_('Service modules'),
			_('Performing actions when connecting and disconnecting the Internet (available in the "Service" mode).'));

		// LED control

		s.tab('led_control', _('LED control'));

		o = s.taboption('led_control', form.SectionValue, 'mod_led_control', form.NamedSection,
			'mod_led_control', 'mod_led_control',
			_('<abbr title="Light Emitting Diode">LED</abbr> control'),
			_('<abbr title="Light Emitting Diode">LED</abbr> is on when Internet is available.'))
		ss = o.subsection;

		if(this.leds.length > 0) {

			// enabled
			o = ss.option(form.Flag, 'enabled',
				_('Enable'));
			o.rmempty = false;

			// led_name
			o = ss.option(form.ListValue, 'led_name',
				_('<abbr title="Light Emitting Diode">LED</abbr> Name'));
			o.depends({ enabled: '1' });
			this.leds.sort((a, b) => a.name > b.name);
			this.leds.forEach(e => o.value(e.name));
		} else {
			o = ss.option(form.DummyValue, '_dummy');
			o.rawhtml = true;
			o.default = '<label class="cbi-value-title"></label><div class="cbi-value-field"><em>' +
				_('No <abbr title="Light Emitting Diode">LED</abbr>s available...') +
				'</em></div>';
		};

		// Reboot device

		s.tab('reboot_device', _('Reboot device'));

		o = s.taboption('reboot_device', form.SectionValue, 'mod_reboot', form.NamedSection,
			'mod_reboot', 'mod_reboot',
			_('Reboot device'),
			_('Device will be rebooted when the Internet is disconnected.'));
		ss = o.subsection;

		// enabled
		o = ss.option(form.Flag, 'enabled',
			_('Enable'));
		o.rmempty = false;

		// dead_period
		o = ss.option(this.CBITimeInput,
			'dead_period', _('Dead period'),
			_('Longest period of time without Internet access until the device is rebooted.')
		);
		o.rmempty = false;

		// force_reboot_delay
		o = ss.option(form.ListValue,
			'force_reboot_delay', _('Forced reboot delay'),
			_('Waiting for a reboot to complete before performing a forced reboot.')
		);
		o.value(0,    _('Disable forced reboot'));
		o.value(60,   '1 ' + _('min'));
		o.value(120,  '2 ' + _('min'));
		o.value(300,  '5 ' + _('min'));
		o.value(600,  '10 ' + _('min'));
		o.value(1800, '30 ' + _('min'));
		o.value(3600, '1 ' + _('hour'));

		// Restart network

		s.tab('restart_network', _('Restart network'));

		o = s.taboption('restart_network', form.SectionValue, 'mod_network_restart', form.NamedSection,
			'mod_network_restart', 'mod_network_restart',
			_('Restart network'),
			_('Network will be restarted when the Internet is disconnected.'));
		ss = o.subsection;

		// enabled
		o = ss.option(form.Flag, 'enabled',
			_('Enable'));
		o.rmempty = false;

		// dead_period
		o = ss.option(this.CBITimeInput,
			'dead_period', _('Dead period'),
			_('Longest period of time without Internet access before network restart.')
		);
		o.rmempty = false;

		// attempts
		o = ss.option(form.ListValue,
			'attempts', _('Restart attempts'),
			_('Maximum number of network restart attempts before Internet access is available.')
		);
		o.value(1);
		o.value(2);
		o.value(3);
		o.value(4);
		o.value(5);

		// iface
		o = ss.option(widgets.DeviceSelect, 'iface', _('Interface'),
			_('Network interface to restart. If not specified, then the network service is restarted.')
		);

		// restart_timeout
		o = ss.option(form.ListValue,
			'restart_timeout', _('Restart timeout'),
			_('Timeout between stopping and starting the interface.')
		);
		o.value(0,  '0 ' + _('sec'));
		o.value(1,  '1 ' + _('sec'));
		o.value(2,  '2 ' + _('sec'));
		o.value(3,  '3 ' + _('sec'));
		o.value(4,  '4 ' + _('sec'));
		o.value(5,  '5 ' + _('sec'));
		o.value(6,  '6 ' + _('sec'));
		o.value(7,  '7 ' + _('sec'));
		o.value(8,  '8 ' + _('sec'));
		o.value(9,  '9 ' + _('sec'));
		o.value(10, '10 ' + _('sec'));

		// Restart modem

		s.tab('restart_modem', _('Restart modem'));

		o = s.taboption('restart_modem', form.SectionValue, 'mod_modem_restart', form.NamedSection,
			'mod_modem_restart', 'mod_modem_restart',
			_('Restart modem'),
			_('Modem will be restarted when the Internet is disconnected.'));
		ss = o.subsection;

		if(this.mm) {

			// enabled
			o = ss.option(form.Flag, 'enabled',
				_('Enable'),
			);
			o.rmempty = false;

			// dead_period
			o = ss.option(this.CBITimeInput,
				'dead_period', _('Dead period'),
				_('Longest period of time without Internet access before modem restart.')
			);
			o.rmempty = false;

			// any_band
			o = ss.option(form.Flag,
				'any_band', _('Unlock modem bands'),
				_('Set the modem to be allowed to use any band.')
			);
			o.rmempty = false;

			// iface
			o = ss.option(widgets.NetworkSelect, 'iface', _('Interface'),
				_('ModemManger interface. If specified, it will be restarted after restarting ModemManager.')
			);
			o.multiple = false;
			o.nocreate = true;
			o.rmempty  = true;

		} else {
			o         = ss.option(form.DummyValue, '_dummy');
			o.rawhtml = true;
			o.default = '<label class="cbi-value-title"></label><div class="cbi-value-field"><em>' +
				_('ModemManager is not available...') +
				'</em></div>';
		};

		// Email notification

		s.tab('email', _('Email notification'));

		o = s.taboption('email', form.SectionValue, 'mod_email', form.NamedSection,
			'mod_email', 'mod_email',
			_('Email notification'),
			_('An email will be sent when the internet connection is restored after being disconnected.'));
		ss = o.subsection;

		if(this.mta) {

			// enabled
			o = ss.option(form.Flag, 'enabled',
				_('Enable'));
			o.rmempty = false;

			// alive_period
			o = ss.option(this.CBITimeInput,
				'alive_period', _('Alive period'),
				_('Longest period of time after connecting to the Internet before sending a message.')
			);
			o.rmempty = false;

			// host_alias
			o = ss.option(form.Value, 'host_alias',
				_('Host alias'),
				_('Host identifier in messages. If not specified, hostname will be used.'));

			// mail_recipient
			o = ss.option(form.Value,
				'mail_recipient', _('Recipient'));
			o.description = _('Email address of the recipient.');

			// mail_sender
			o = ss.option(form.Value,
				'mail_sender', _('Sender'));
			o.description = _('Email address of the sender.');

			// mail_user
			o = ss.option(form.Value,
				'mail_user', _('User'));
			o.description = _('Username for SMTP authentication.');

			// mail_password
			o = ss.option(form.Value,
				'mail_password', _('Password'));
			o.description = _('Password for SMTP authentication.');
			o.password    = true;

			// mail_smtp
			o = ss.option(form.Value,
				'mail_smtp', _('SMTP server'));
			o.description = _('Hostname/IP address of the SMTP server.');
			o.datatype    = 'host';
			o.default = 'smtp.gmail.com';

			// mail_smtp_port
			o = ss.option(form.Value,
				'mail_smtp_port', _('SMTP server port'));
			o.datatype    = 'port';
			o.default = '587';

			// mail_security
			o = ss.option(form.ListValue,
				'mail_security', _('Security'));
			o.description = '%s<br />%s'.format(
				_('TLS: use STARTTLS if the server supports it.'),
				_('SSL: SMTP over SSL.'),
			);
			o.value('tls', 'TLS');
			o.value('ssl', 'SSL');
			o.default = 'tls';

		} else {
			o         = ss.option(form.DummyValue, '_dummy');
			o.rawhtml = true;
			o.default = '<label class="cbi-value-title"></label><div class="cbi-value-field"><em>' +
				_('Mailsend is not available...') +
				'</em></div>';
		};

		// User scripts

		let upScriptEditDialog = new this.fileEditDialog(
			this.upScriptPath,
			_('up-script'),
			_('Shell commands that run when connected to the Internet.'),
		);
		let downScriptEditDialog = new this.fileEditDialog(
			this.downScriptPath,
			_('down-script'),
			_('Shell commands to run when disconnected from the Internet.'),
		);

		s.tab('user_scripts', _('User scripts'));

		o = s.taboption('user_scripts', form.SectionValue, 'mod_user_scripts', form.NamedSection,
			'mod_user_scripts', 'mod_user_scripts',
			_('User scripts'),
			_('Shell commands to run when connected or disconnected from the Internet.'));
		ss = o.subsection;

		// enabled
		o = ss.option(form.Flag, 'enabled',
			_('Enable'));
		o.rmempty = false;

		// up_script edit dialog
		o = ss.option(form.Button,
			'_up_script_btn', _('Edit up-script'),
			_('Shell commands that run when connected to the Internet.')
		);
		o.onclick    = () => upScriptEditDialog.show();
		o.inputtitle = _('Edit');
		o.inputstyle = 'edit btn';

		// alive_period
		o = ss.option(this.CBITimeInput,
			'alive_period', _('Alive period'),
			_('Longest period of time after connecting to Internet before "up-script" runs.')
		);
		o.rmempty = false;

		// down_script edit dialog
		o = ss.option(form.Button,
			'_down_script_btn', _('Edit down-script'),
			_('Shell commands to run when disconnected from the Internet.')
		);
		o.onclick    = () => downScriptEditDialog.show();
		o.inputtitle = _('Edit');
		o.inputstyle = 'edit btn';

		// dead_period
		o = ss.option(this.CBITimeInput,
			'dead_period', _('Dead period'),
			_('Longest period of time after disconnecting from Internet before "down-script" runs.')
		);
		o.rmempty = false;


		if(this.currentAppMode !== '0') {
			L.Poll.add(
				L.bind((this.currentAppMode === '2') ? this.servicePoll : this.uiPoll, this),
				this.pollInterval
			);
		};

		let map_promise = m.render();
		map_promise.then(node => node.classList.add('fade-in'));
		return map_promise;
	},

	handleSaveApply: function(ev, mode) {
		return this.handleSave(ev).then(() => {
			ui.changes.apply(mode == '0');
			window.setTimeout(() => this.serviceRestart(), 3000);
		});
	},
});
