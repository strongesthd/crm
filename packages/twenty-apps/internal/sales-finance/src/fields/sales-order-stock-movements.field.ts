import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  SALES_ORDER_STOCK_MOVEMENTS_FIELD_UNIVERSAL_IDENTIFIER,
  SALES_ORDER_UNIVERSAL_IDENTIFIER,
  STOCK_MOVEMENT_SALES_ORDER_FIELD_UNIVERSAL_IDENTIFIER,
  STOCK_MOVEMENT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: SALES_ORDER_STOCK_MOVEMENTS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SALES_ORDER_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'stockMovements',
  label: 'Phiếu kho',
  icon: 'IconPackages',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    STOCK_MOVEMENT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    STOCK_MOVEMENT_SALES_ORDER_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
    onDelete: OnDeleteAction.SET_NULL,
  },
});
