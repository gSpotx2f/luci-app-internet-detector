#
# Copyright (C) 2020 gSpot (https://github.com/gSpotx2f/luci-app-internet-detector)
#
# This is free software, licensed under the MIT License.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-internet-detector
LUCI_TITLE:=Internet detector for the LuCI status page
LUCI_DEPENDS:=+luci-mod-admin-full
LUCI_PKGARCH:=all
PKG_LICENSE:=MIT

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
