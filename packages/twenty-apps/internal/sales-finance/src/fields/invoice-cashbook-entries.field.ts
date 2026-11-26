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
  universalIdentifier: INVOICE_CASHBOOK_ENTRIES_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: INVOICE_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'cashbookEntries',
  label: 'Phiếu thu/chi',
  icon: 'IconCreditCard',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    CASHBOOK_ENTRY_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    CASHBOOK_ENTRY_INVOICE_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
    onDelete: OnDeleteAction.SET_NULL,
  },
});
