#
# (с) 2021 gSpot (https://github.com/gSpotx2f/luci-app-internet-detector)
#

include $(TOPDIR)/rules.mk

PKG_NAME:=internet-detector
PKG_VERSION:=0.3.0
PKG_RELEASE:=1
PKG_MAINTAINER:=gSpot <https://github.com/gSpotx2f/luci-app-internet-detector>
PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)

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

endef

define Package/$(PKG_NAME)/conffiles
	/etc/config/internet-detector
	/etc/internet-detector/down-script
	/etc/internet-detector/run-script
	/etc/internet-detector/up-script
endef

define Build/Prepare
	$(CP) -r ./files $(PKG_BUILD_DIR)/files
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/files/usr/bin/internet-detector $(1)/usr/bin/internet-detector
	$(INSTALL_DIR) $(1)/etc/internet-detector
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/files/etc/internet-detector/down-script $(1)/etc/internet-detector/down-script
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/files/etc/internet-detector/run-script $(1)/etc/internet-detector/run-script
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/files/etc/internet-detector/up-script $(1)/etc/internet-detector/up-script
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) $(PKG_BUILD_DIR)/files/etc/config/internet-detector $(1)/etc/config/internet-detector
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/files/etc/init.d/internet-detector $(1)/etc/init.d/internet-detector
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
