import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';

import {
  INVOICE_PRINT_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  INVOICE_PRINT_TAB_UNIVERSAL_IDENTIFIER,
  INVOICE_PRINT_WIDGET_UNIVERSAL_IDENTIFIER,
  INVOICE_RECORD_FIELDS_TAB_UNIVERSAL_IDENTIFIER,
  INVOICE_RECORD_FIELDS_WIDGET_UNIVERSAL_IDENTIFIER,
  INVOICE_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER,
  INVOICE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default definePageLayout({
  universalIdentifier: INVOICE_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER,
  name: 'Invoice record page',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier: INVOICE_UNIVERSAL_IDENTIFIER,
  tabs: [
    {
      universalIdentifier: INVOICE_RECORD_FIELDS_TAB_UNIVERSAL_IDENTIFIER,
      title: 'Thông tin',
      position: 0,
      icon: 'IconList',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier:
            INVOICE_RECORD_FIELDS_WIDGET_UNIVERSAL_IDENTIFIER,
          title: 'Thông tin hóa đơn',
          type: 'FIELDS',
          configuration: {
            configurationType: 'FIELDS',
          },
        },
      ],
    },
    {
      universalIdentifier: INVOICE_PRINT_TAB_UNIVERSAL_IDENTIFIER,
      title: 'In hóa đơn',
      position: 1,
      icon: 'IconCreditCard',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: INVOICE_PRINT_WIDGET_UNIVERSAL_IDENTIFIER,
          title: 'Bản in hóa đơn',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier:
              INVOICE_PRINT_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
          },
        },
      ],
    },
  ],
});
