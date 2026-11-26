import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  INVOICE_SALES_ORDER_FIELD_UNIVERSAL_IDENTIFIER,
  INVOICE_UNIVERSAL_IDENTIFIER,
  SALES_ORDER_UNIVERSAL_IDENTIFIER,
  SALES_ORDER_INVOICES_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: INVOICE_SALES_ORDER_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: INVOICE_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'salesOrder',
  label: 'Đơn bán hàng',
  icon: 'IconShoppingCart',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    SALES_ORDER_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    SALES_ORDER_INVOICES_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'salesOrderId',
  },
});
