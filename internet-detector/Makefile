#
# (с) 2021 gSpot (https://github.com/gSpotx2f/luci-app-internet-detector)
#

include $(TOPDIR)/rules.mk

PKG_NAME:=internet-detector
PKG_VERSION:=0.4
PKG_RELEASE:=2
PKG_MAINTAINER:=gSpot <https://github.com/gSpotx2f/luci-app-internet-detector>

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Internet detector
  URL:=https://github.com/gSpotx2f/luci-app-internet-detector
  PKGARCH:=all
  DEPENDS:=+lua +luci-lib-nixio +libuci-lua
endef

define Package/$(PKG_NAME)/description
  Internet-detector is a small daemon
  for checking Internet availability.
  Written in Lua using the nixio library.
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/internet-detector
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/internet-detector $(1)/etc/config/internet-detector
	$(INSTALL_DIR) $(1)/etc/internet-detector
	$(INSTALL_BIN) ./files/etc/internet-detector/down-script $(1)/etc/internet-detector/down-script
	$(INSTALL_BIN) ./files/etc/internet-detector/run-script $(1)/etc/internet-detector/run-script
	$(INSTALL_BIN) ./files/etc/internet-detector/up-script $(1)/etc/internet-detector/up-script
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/internet-detector $(1)/etc/init.d/internet-detector
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./files/usr/bin/internet-detector $(1)/usr/bin/internet-detector
	$(INSTALL_DIR) $(1)/usr/lib/internet-detector
	$(INSTALL_DATA) ./files/usr/lib/internet-detector/mod_led_control.lua $(1)/usr/lib/internet-detector/mod_led_control.lua
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
