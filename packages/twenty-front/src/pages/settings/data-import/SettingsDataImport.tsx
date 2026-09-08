import { useState } from 'react';

import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { TextArea } from '@/ui/input/components/TextArea';
import { Button } from 'twenty-ui/input';
import { Card } from 'twenty-ui/surfaces';
import { H2Title } from 'twenty-ui/typography';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

const DEFAULT_CONFIG = JSON.stringify(
  {
    entities: [
      {
        objectName: 'company',
        fields: [
          { source: 'name', target: 'name', required: true },
          { source: 'domainName', target: 'domainName' },
        ],
      },
      {
        objectName: 'person',
        fields: [
          { source: 'nameFirstName', target: 'nameFirstName' },
          { source: 'nameLastName', target: 'nameLastName' },
          { source: 'email', target: 'emailsPrimaryEmailEmail' },
        ],
        relations: [
          {
            sourceField: 'companyName',
            targetField: 'companyId',
            parentObject: 'company',
            parentNameField: 'name',
            createIfMissing: true,
          },
        ],
      },
    ],
    batchSize: 100,
  },
  null,
  2,
);

const DEFAULT_DATASET = JSON.stringify(
  {
    company: [{ name: 'Novatech HP', domainName: 'novatechhp.vn' }],
    person: [
      {
        nameFirstName: 'Nguyen',
        nameLastName: 'Tien',
        email: 'test@example.com',
        companyName: 'Novatech HP',
      },
    ],
  },
  null,
  2,
);

export const SettingsDataImport = () => {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [dataset, setDataset] = useState(DEFAULT_DATASET);
  const [result, setResult] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImport = async () => {
    setIsSubmitting(true);
    setResult('');

    try {
      const response = await fetch(`${REACT_APP_SERVER_BASE_URL}/rest/import-manager`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          config: JSON.parse(config),
          dataset: JSON.parse(dataset),
        }),
      });

      const responseBody = await response.text();
      if (!response.ok) {
        throw new Error(responseBody || `Import failed (${response.status})`);
      }

      setResult(responseBody);
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SettingsPageLayout
      title="Data Import Manager"
      links={[
        { children: 'Workspace', href: getSettingsPath(SettingsPath.General) },
        { children: 'Data Import' },
      ]}
    >
      <SettingsPageContainer>
        <Card rounded>
          <H2Title
            title="Import multiple CRM objects"
            description="Import data and resolve relations in one request."
          />
          <TextArea
            textAreaId="data-import-dataset"
            value={dataset}
            minRows={12}
            onChange={setDataset}
          />
          <H2Title title="Mapping configuration JSON" />
          <TextArea
            textAreaId="data-import-config"
            value={config}
            minRows={16}
            onChange={setConfig}
          />
          <Button
            variant="primary"
            disabled={isSubmitting}
            onClick={handleImport}
            title="Import data"
          >
            {isSubmitting ? 'Importing...' : 'Import data'}
          </Button>
          {result && <pre>{result}</pre>}
        </Card>
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
