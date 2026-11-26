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
  universalIdentifier: STOCK_MOVEMENT_PRODUCT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: STOCK_MOVEMENT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'product',
  label: 'Sản phẩm',
  icon: 'IconPackage',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    PRODUCT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    PRODUCT_STOCK_MOVEMENTS_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'productId',
  },
});
