import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  STOCK_MOVEMENT_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  STOCK_MOVEMENT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: STOCK_MOVEMENT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'stockMovement',
  namePlural: 'stockMovements',
  labelSingular: 'Phiếu kho',
  labelPlural: 'Biến động kho',
  description: 'Ghi nhận nhập, xuất và điều chỉnh tồn kho tại một kho.',
  icon: 'IconPackages',
  labelIdentifierFieldMetadataUniversalIdentifier:
    STOCK_MOVEMENT_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: STOCK_MOVEMENT_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Mã phiếu kho',
      icon: 'IconHash',
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000261',
      type: FieldType.DATE,
      name: 'movementDate',
      label: 'Ngày thực hiện',
      icon: 'IconCalendar',
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000262',
      type: FieldType.SELECT,
      name: 'movementType',
      label: 'Loại biến động',
      icon: 'IconArrowsSort',
      options: [
        {
          id: 'f1ab2000-0000-4000-8000-000000000922',
          value: 'IN',
          label: 'Nhập kho',
          position: 0,
          color: 'green',
        },
        {
          id: 'f1ab2000-0000-4000-8000-000000000923',
          value: 'OUT',
          label: 'Xuất kho',
          position: 1,
          color: 'orange',
        },
        {
          id: 'f1ab2000-0000-4000-8000-000000000924',
          value: 'ADJUSTMENT',
          label: 'Điều chỉnh',
          position: 2,
          color: 'blue',
        },
      ],
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000263',
      type: FieldType.NUMBER,
      name: 'quantity',
      label: 'Số lượng',
      description: 'Nhập số dương; chiều tăng/giảm được xác định bởi loại phiếu.',
      icon: 'IconNumbers',
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000264',
      type: FieldType.TEXT,
      name: 'reason',
      label: 'Lý do',
      icon: 'IconNotes',
      isNullable: true,
    },
  ],
});
