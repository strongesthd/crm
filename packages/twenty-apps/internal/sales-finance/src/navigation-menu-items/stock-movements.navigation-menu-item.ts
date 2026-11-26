import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  STOCK_MOVEMENT_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  STOCK_MOVEMENT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier:
    STOCK_MOVEMENT_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  position: 4,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: STOCK_MOVEMENT_UNIVERSAL_IDENTIFIER,
});
