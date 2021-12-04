'use strict';
'require form';
'require fs';
'require rpc';
'require uci';
'require ui';

const btnStyleEnabled  = 'btn cbi-button-save';
const btnStyleDisabled = 'btn cbi-button-reset';
const btnStyleApply    = 'btn cbi-button-apply';

return L.view.extend({
	execPath            : '/usr/bin/internet-detector',
	upScriptPath        : '/etc/internet-detector/up-script',
	downScriptPath      : '/etc/internet-detector/down-script',
	runScriptPath       : '/etc/internet-detector/run-script',
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

	callInitStatus: rpc.declare({
		object: 'luci',
		method: 'getInitList',
		params: [ 'name' ],
		expect: { '': {} }
	}),

	getInitStatus: function() {
		return this.callInitStatus('internet-detector').then(res => {
			if(res) {
				return res['internet-detector'].enabled;
			} else {
				throw _('Command failed');
			}
		}).catch(e => {
			ui.addNotification(null,
				E('p', _('Failed to get %s init status: %s').format('internet-detector', e)));
		});
	},

	callInitAction: rpc.declare({
		object: 'luci',
		method: 'setInitAction',
		params: [ 'name', 'action' ],
		expect: { result: false }
	}),

	handleServiceAction: function(action) {
		return this.callInitAction('internet-detector', action).then(success => {
			if(!success) {
				throw _('Command failed');
			};
			return true;
		}).catch(e => {
			ui.addNotification(null,
				E('p', _('Service action failed "%s %s": %s').format('internet-detector', action, e)));
		});
	},

	serviceRestart: function(ev) {
		L.Poll.stop();
		return this.handleServiceAction('restart').then(() => {
			this.servicePoll();
			L.Poll.start();
		});
	},

	fileEditDialog: L.Class.extend({
		__init__: function(file, title, description, callback, fileExists=false) {
			this.file        = file;
			this.title       = title;
			this.description = description;
			this.callback    = callback;
			this.fileExists  = fileExists;
		},

		load: function() {
			return fs.read(this.file);
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
							content || '')
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

	CBIBlockService: form.DummyValue.extend({
		ctx: null,

		renderWidget: function(section_id, option_index, cfgvalue) {
			this.title = this.description = null;

			this.ctx.serviceButton = E('button', {
				'class': btnStyleApply,
				'click': ui.createHandlerFn(this.ctx, this.ctx.serviceRestart),
			}, _('Restart'));
			this.ctx.initButton = E('button', {
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
							this.ctx.initButton.className = btnStyleEnabled;
							this.ctx.initStatus = true;
						}
						else {
							this.ctx.initButton.textContent = _('Disabled');
							this.ctx.initButton.className = btnStyleDisabled;
							this.ctx.initStatus = false;
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

			return E('div', { 'class': 'cbi-section fade-in' },
				E('div', { 'class': 'cbi-section-node' }, [
					internetStatus,
					serviceItems,
				])
			);
		},
	}),

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
		
		return fs.list('/sys/class/leds').then(function(data) {
			return data.filter(function(dev) {
				return dev.name;
			});
		});
		
		return Promise.all([
			fs.exec(this.execPath, [ 'status' ]),
			this.getInitStatus(),
			uci.load('internet-detector'),
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
		this.currentAppMode      = uci.get('internet-detector', 'config', 'mode');
		this.uiCheckIntervalUp   = Number(uci.get('internet-detector', 'config', 'ui_interval_up'));
		this.uiCheckIntervalDown = Number(uci.get('internet-detector', 'config', 'ui_interval_down'));

		let upScriptEditDialog = new this.fileEditDialog(
			this.upScriptPath,
			_('up-script'),
			_('Shell commands that run when connected to the Internet'),
		);
		let downScriptEditDialog = new this.fileEditDialog(
			this.downScriptPath,
			_('down-script'),
			_('Shell commands to run when disconnected from the Internet'),
		);
		let runScriptEditDialog = new this.fileEditDialog(
			this.runScriptPath,
			_('run-script'),
			_("Shell commands that are executed every time the Internet is checked for availability"),
		);

		let m, s, o;

		m = new form.Map('internet-detector', _('Internet detector'),
			_('Checking Internet availability.'));

		s = m.section(form.NamedSection, 'config');
		s.anonymous = true;
		s.addremove = false;

		s.tab('main_settings', _('Main settings'));

		// service section
		o = s.taboption('main_settings', this.CBIBlockService, '_dummy_service');
		o.ctx = this;
		
		// led
		o = s.taboption('main_settings', form.Value, 'status_led', 
			_('Status LED'), 
			_("Select the LED showing the internet connection status."));
		data.forEach(function(dev) {
			o.value(dev.name);
		});

		// mode
		o = s.taboption('main_settings', form.ListValue,
			'mode', _('Internet detector mode'));
		o.value('0', _('Disabled'));
		o.value('1', _('Web UI only'));
		o.value('2', _('Service'));
		o.description = '%s;<br>%s;<br>%s;'.format(
			_('Disabled: detector is completely off'),
			_('Web UI only: detector works only when the Web UI is open (UI detector)'),
			_('Service: detector always runs as a system service')
		);

		// hosts
		o = s.taboption('main_settings', form.DynamicList,
			'hosts', _('Hosts'));
		o.description = _('Hosts to check Internet availability. Hosts are polled (in list order) until at least one of them responds');
		o.datatype = 'or(host,hostport)';

		// check_type
		o = s.taboption('main_settings', form.ListValue,
			'check_type', _('Check type'));
		o.description = _('Host availability check type');
		o.value(0, _('Ping host'));
		o.value(1, _('TCP port connection'));

		// tcp_port
		o = s.taboption('main_settings', form.Value,
			'tcp_port', _('TCP port'));
		o.description = _('Default port value for TCP connections');
		o.rmempty = false;
		o.datatype = "port";

		s.tab('ui_detector_configuration', _('UI detector configuration'));

		let makeUIIntervalOptions = L.bind(function(list) {
			list.value(1, '%d %s'.format(this.pollInterval, _('sec')));
			list.value(2, '%d %s'.format(this.pollInterval * 2, _('sec')));
			list.value(3, '%d %s'.format(this.pollInterval * 3, _('sec')));
			list.value(4, '%d %s'.format(this.pollInterval * 4, _('sec')));
			list.value(5, '%d %s'.format(this.pollInterval * 5, _('sec')));
			list.value(6, '%d %s'.format(this.pollInterval * 6, _('sec')));
		}, this);

		// ui_interval_up
		o = s.taboption('ui_detector_configuration', form.ListValue,
			'ui_interval_up', _('Alive interval'));
		o.description = _('Hosts polling interval when the Internet is up');
		makeUIIntervalOptions(o);

		// ui_interval_down
		o = s.taboption('ui_detector_configuration', form.ListValue,
			'ui_interval_down', _('Dead interval'));
		o.description = _('Hosts polling interval when the Internet is down');
		makeUIIntervalOptions(o);

		// ui_connection_attempts
		o = s.taboption('ui_detector_configuration', form.ListValue,
			'ui_connection_attempts', _('Connection attempts'));
		o.description = _('Maximum number of attempts to connect to each host');
		o.value(1);
		o.value(2);
		o.value(3);

		// ui_connection_timeout
		o = s.taboption('ui_detector_configuration', form.ListValue,
			'ui_connection_timeout', _('Connection timeout'));
		o.description = _('Maximum timeout for waiting for a response from the host');
		o.value(1, "1 " + _('sec'));
		o.value(2, "2 " + _('sec'));
		o.value(3, "3 " + _('sec'));

		s.tab('service_configuration', _('Service configuration'));

		// enable_logger
		o = s.taboption('service_configuration', form.Flag,
			'enable_logger', _('Enable logging'));
		o.description = _('Write messages to the system log');
		o.rmempty = false;

		// enable_up_script
		o = s.taboption('service_configuration', form.Flag,
			'enable_up_script', _('Enable up-script'));
		o.description = _('Execute commands when the Internet is connected');
		o.rmempty = false;

		// up_script edit dialog
		o = s.taboption('service_configuration', form.Button,
			'_up_script_btn', _('Edit up-script'));
		o.onclick = () => upScriptEditDialog.show();
		o.inputtitle = _('Edit');
		o.inputstyle = 'edit btn';

		// enable_down_script
		o = s.taboption('service_configuration', form.Flag,
			'enable_down_script', _('Enable down-script'));
		o.description = _('Execute commands when the Internet is disconnected');
		o.rmempty = false;

		// down_script edit dialog
		o = s.taboption('service_configuration', form.Button,
			'_down_script_btn', _('Edit down-script'));
		o.onclick = () => downScriptEditDialog.show();
		o.inputtitle = _('Edit');
		o.inputstyle = 'edit btn';

		// enable_run_script
		o = s.taboption('service_configuration', form.Flag,
			'enable_run_script', _('Enable run-script'));
		o.description = _('Execute commands every time the Internet is checked for availability');
		o.rmempty = false;

		// run_script edit dialog
		o = s.taboption('service_configuration', form.Button,
			'_run_script_btn', _('Edit run-script'));
		o.onclick = () => runScriptEditDialog.show();
		o.inputtitle = _('Edit');
		o.inputstyle = 'edit btn';

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
		o = s.taboption('service_configuration', form.ListValue,
			'interval_up', _('Alive interval'));
		o.description = _('Hosts polling interval when the Internet is up');
		makeIntervalOptions(o);

		// interval_down
		o = s.taboption('service_configuration', form.ListValue,
			'interval_down', _('Dead interval'));
		o.description = _('Hosts polling interval when the Internet is down');
		makeIntervalOptions(o);

		// connection_attempts
		o = s.taboption('service_configuration', form.ListValue,
			'connection_attempts', _('Connection attempts'));
		o.description = _('Maximum number of attempts to connect to each host');
		o.value(1);
		o.value(2);
		o.value(3);
		o.value(4);
		o.value(5);

		// connection_timeout
		o = s.taboption('service_configuration', form.ListValue,
			'connection_timeout', _('Connection timeout'));
		o.description = _('Maximum timeout for waiting for a response from the host');
		o.value(1, "1 " + _('sec'));
		o.value(2, "2 " + _('sec'));
		o.value(3, "3 " + _('sec'));
		o.value(4, "4 " + _('sec'));
		o.value(5, "5 " + _('sec'));
		o.value(6, "6 " + _('sec'));
		o.value(7, "7 " + _('sec'));
		o.value(8, "8 " + _('sec'));
		o.value(9, "9 " + _('sec'));
		o.value(10, "10 " + _('sec'));

		if(this.currentAppMode !== '0') {
			L.Poll.add(
				L.bind((this.currentAppMode === '2') ? this.servicePoll : this.uiPoll, this),
				this.pollInterval
			);
		};

		let mapPromise = m.render();
		mapPromise.then(node => node.classList.add('fade-in'));
		return mapPromise;
	},

	handleSaveApply: function(ev, mode) {
 	   return this.handleSave(ev).then(() => {
			ui.changes.apply(mode == '0');
			window.setTimeout(() => this.serviceRestart(), 3000);
		});
	},
});
