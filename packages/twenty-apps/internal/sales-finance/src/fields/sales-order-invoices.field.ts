import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  INVOICE_SALES_ORDER_FIELD_UNIVERSAL_IDENTIFIER,
  INVOICE_UNIVERSAL_IDENTIFIER,
  SALES_ORDER_INVOICES_FIELD_UNIVERSAL_IDENTIFIER,
  SALES_ORDER_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: SALES_ORDER_INVOICES_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SALES_ORDER_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'invoices',
  label: 'Hóa đơn nội bộ',
  icon: 'IconCreditCard',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    INVOICE_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    INVOICE_SALES_ORDER_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
    onDelete: OnDeleteAction.SET_NULL,
  },
});
