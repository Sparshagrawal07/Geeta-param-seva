import { View } from 'react-native';

import { AppSelect } from '@/components/ui/app-select';
import { useLocale } from '@/providers/locale-provider';
import type { Group } from '@/types/group';

interface GroupScopeSelectorProps {
  groups: Group[];
  selectedGroupId: string | null;
  onSelect: (id: string) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
}

export function GroupScopeSelector({
  groups,
  selectedGroupId,
  onSelect,
  label,
  hint,
  disabled = false,
}: GroupScopeSelectorProps) {
  const { t } = useLocale();

  if (groups.length === 0) {
    return null;
  }

  const resolvedId = selectedGroupId ?? groups[0]?.id ?? null;
  const options = groups.map((group) => ({
    value: group.id,
    label: group.name,
  }));

  return (
    <View className="mb-4">
      <AppSelect
        label={label ?? t('selectGroup')}
        value={resolvedId}
        options={options}
        onSelect={onSelect}
        hint={hint}
        disabled={disabled}
        readOnly={groups.length === 1}
      />
    </View>
  );
}
