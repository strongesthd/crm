import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  PRODUCT_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  PRODUCT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: PRODUCT_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  position: 0,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: PRODUCT_UNIVERSAL_IDENTIFIER,
});
