import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  INVOICE_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  INVOICE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: INVOICE_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  position: 2,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: INVOICE_UNIVERSAL_IDENTIFIER,
});
