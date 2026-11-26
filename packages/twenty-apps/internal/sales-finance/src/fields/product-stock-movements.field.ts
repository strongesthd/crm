import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  PRODUCT_STOCK_MOVEMENTS_FIELD_UNIVERSAL_IDENTIFIER,
  PRODUCT_UNIVERSAL_IDENTIFIER,
  STOCK_MOVEMENT_PRODUCT_FIELD_UNIVERSAL_IDENTIFIER,
  STOCK_MOVEMENT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: PRODUCT_STOCK_MOVEMENTS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: PRODUCT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'stockMovements',
  label: 'Biến động kho',
  icon: 'IconPackages',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    STOCK_MOVEMENT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    STOCK_MOVEMENT_PRODUCT_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
    onDelete: OnDeleteAction.SET_NULL,
  },
});
