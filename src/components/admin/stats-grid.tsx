import { Children, type ReactNode } from 'react';
import { View } from 'react-native';

const GRID_GAP = 12;

interface StatsGridProps {
  children: ReactNode;
}

function GridCell({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, minWidth: 0, alignSelf: 'stretch' }}>
      {children}
    </View>
  );
}

export function StatsGrid({ children }: StatsGridProps) {
  const items = Children.toArray(children);
  const rows: ReactNode[][] = [];

  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2));
  }

  return (
    <View style={{ gap: GRID_GAP }}>
      {rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={{
            flexDirection: 'row',
            alignItems: 'stretch',
            gap: GRID_GAP,
          }}>
          {row.map((child, colIndex) => (
            <GridCell key={colIndex}>{child}</GridCell>
          ))}
          {row.length === 1 ? <GridCell>{null}</GridCell> : null}
        </View>
      ))}
    </View>
  );
}
