// scripts/lib/tui-ink/screens/MainScreen.tsx
import React from 'react';

import { useNavigate } from 'react-router';
import { Box, Text } from 'ink';
import { Select } from '@inkjs/ui';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

const MENU_OPTIONS = [
  { label: 'HUD', value: 'hud' },
  { label: 'Memory Genealogy', value: 'memory-genealogy' },
  { label: 'Setup', value: 'setup' },
  { label: 'Update', value: 'update' },
  { label: 'Uninstall', value: 'uninstall' },
  { label: 'Doctor', value: 'doctor' },
  { label: 'Exit', value: 'exit' },
];

interface MainScreenProps {
  rootDir: string;
  onExit: () => void;
}

export function MainScreen({ rootDir, onExit }: MainScreenProps) {
  const navigate = useNavigate();

  const handleSelect = (value: string) => {
    if (value === 'exit') {
      onExit();
    } else {
      navigate(`/${value}`);
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Header rootDir={rootDir} />
      <Box flexDirection="column" marginY={1}>
        <Text>Select an action:</Text>
        <Select
          options={MENU_OPTIONS}
          onChange={handleSelect}
        />
        <Box marginTop={1}>
          <Text dimColor>Tip: setup/update enable native enhancements by default; use doctor with Native only for a fast check.</Text>
        </Box>
      </Box>
      <Footer />
    </Box>
  );
}
