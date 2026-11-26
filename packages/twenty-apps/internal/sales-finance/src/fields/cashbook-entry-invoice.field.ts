import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  CASHBOOK_ENTRY_INVOICE_FIELD_UNIVERSAL_IDENTIFIER,
  CASHBOOK_ENTRY_UNIVERSAL_IDENTIFIER,
  INVOICE_CASHBOOK_ENTRIES_FIELD_UNIVERSAL_IDENTIFIER,
  INVOICE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: CASHBOOK_ENTRY_INVOICE_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: CASHBOOK_ENTRY_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'invoice',
  label: 'Hóa đơn liên quan',
  icon: 'IconCreditCard',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    INVOICE_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    INVOICE_CASHBOOK_ENTRIES_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'invoiceId',
  },
});
