import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  CASHBOOK_ENTRY_UNIVERSAL_IDENTIFIER,
  CASHBOOK_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: CASHBOOK_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  position: 3,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: CASHBOOK_ENTRY_UNIVERSAL_IDENTIFIER,
});
