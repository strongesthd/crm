import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  SALES_ORDER_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  SALES_ORDER_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: SALES_ORDER_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  position: 1,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: SALES_ORDER_UNIVERSAL_IDENTIFIER,
});
