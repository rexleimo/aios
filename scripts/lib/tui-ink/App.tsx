// scripts/lib/tui-ink/App.tsx

import React, { useState, useCallback } from 'react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router';
import { Box, Text } from 'ink';
import { MainScreen } from './screens/MainScreen';
import { SetupScreen } from './screens/SetupScreen';
import { UpdateScreen } from './screens/UpdateScreen';
import { UninstallScreen } from './screens/UninstallScreen';
import { DoctorScreen } from './screens/DoctorScreen';
import { HudScreen } from './screens/HudScreen';
import { MemoryGenealogyScreen } from './screens/MemoryGenealogyScreen';
import { SkillPickerScreen } from './screens/SkillPickerScreen';
import { ConfirmScreen } from './screens/ConfirmScreen';
import { useSetupOptions } from './hooks/useSetupOptions';
import type { TuiSessionProps, Action, Client, Scope, ComponentsConfig } from './types';

function AppContent({
  rootDir,
  catalogSkills,
  installedSkills,
  onRun,
  onExit
}: TuiSessionProps & { onExit: () => void }) {
  const navigate = useNavigate();
  const {
    options,
    cycleWrapMode,
    cycleScope,
    cycleClient,
    toggleComponent,
    toggleSkipFlag,
    setSelectedSkills,
  } = useSetupOptions(catalogSkills, installedSkills);

  const [skillPickerOwner, setSkillPickerOwner] = useState<Action | null>(null);
  const [skillPickerClient, setSkillPickerClient] = useState<Client>('all');
  const [skillPickerScope, setSkillPickerScope] = useState<Scope>('global');

  const handleSelectSkills = useCallback((action: Action) => {
    setSkillPickerOwner(action);
    setSkillPickerClient(options[action].client as Client);
    setSkillPickerScope(options[action].scope as Scope);
    navigate(`/skills?owner=${action}`);
  }, [options, navigate]);

  const handleSetSelectedSkills = useCallback((skills: string[]) => {
    if (skillPickerOwner) {
      setSelectedSkills(skillPickerOwner, skills);
    }
  }, [skillPickerOwner, setSelectedSkills]);

  const handleRunConfirm = useCallback((action: Action) => {
    navigate(`/confirm?action=${action}`);
  }, [navigate]);

  const handleRun = useCallback(async (
    action: Action,
    actionOptions: unknown,
    hooks?: { onLog?: (line: string) => void }
  ) => {
    await onRun(action, actionOptions, hooks);
  }, [onRun]);

  return (
    <Routes>
      <Route
        path="/"
        element={<MainScreen rootDir={rootDir} onExit={onExit} />}
      />
      <Route
        path="/hud"
        element={<HudScreen rootDir={rootDir} />}
      />
      <Route
        path="/memory-genealogy"
        element={<MemoryGenealogyScreen rootDir={rootDir} />}
      />
      <Route
        path="/setup"
        element={
          <SetupScreen
            rootDir={rootDir}
            options={options.setup}
            onToggleComponent={(comp) => toggleComponent('setup', comp as keyof ComponentsConfig)}
            onCycleWrapMode={() => cycleWrapMode('setup', 'next')}
            onCycleWrapModePrevious={() => cycleWrapMode('setup', 'prev')}
            onCycleScope={() => cycleScope('setup', 'next')}
            onCycleScopePrevious={() => cycleScope('setup', 'prev')}
            onCycleClient={() => cycleClient('setup', 'next')}
            onCycleClientPrevious={() => cycleClient('setup', 'prev')}
            onToggleSkipPlaywright={() => toggleSkipFlag('setup', 'skipPlaywrightInstall')}
            onToggleSkipDoctor={() => toggleSkipFlag('setup', 'skipDoctor')}
            onSelectSkills={() => handleSelectSkills('setup')}
            onRun={() => handleRunConfirm('setup')}
          />
        }
      />
      <Route
        path="/update"
        element={
          <UpdateScreen
            rootDir={rootDir}
            options={options.update}
            onToggleComponent={(comp) => toggleComponent('update', comp as keyof ComponentsConfig)}
            onCycleWrapMode={() => cycleWrapMode('update', 'next')}
            onCycleWrapModePrevious={() => cycleWrapMode('update', 'prev')}
            onCycleScope={() => cycleScope('update', 'next')}
            onCycleScopePrevious={() => cycleScope('update', 'prev')}
            onCycleClient={() => cycleClient('update', 'next')}
            onCycleClientPrevious={() => cycleClient('update', 'prev')}
            onToggleWithPlaywright={() => toggleSkipFlag('update', 'withPlaywrightInstall')}
            onToggleSkipDoctor={() => toggleSkipFlag('update', 'skipDoctor')}
            onSelectSkills={() => handleSelectSkills('update')}
            onRun={() => handleRunConfirm('update')}
          />
        }
      />
      <Route
        path="/uninstall"
        element={
          <UninstallScreen
            rootDir={rootDir}
            options={options.uninstall}
            onToggleComponent={(comp) => toggleComponent('uninstall', comp as keyof ComponentsConfig)}
            onCycleScope={() => cycleScope('uninstall', 'next')}
            onCycleScopePrevious={() => cycleScope('uninstall', 'prev')}
            onCycleClient={() => cycleClient('uninstall', 'next')}
            onCycleClientPrevious={() => cycleClient('uninstall', 'prev')}
            onSelectSkills={() => handleSelectSkills('uninstall')}
            onRun={() => handleRunConfirm('uninstall')}
          />
        }
      />
      <Route
        path="/doctor"
        element={
          <DoctorScreen
            rootDir={rootDir}
            options={options.doctor}
            onToggleStrict={() => toggleSkipFlag('doctor', 'strict')}
            onToggleGlobalSecurity={() => toggleSkipFlag('doctor', 'globalSecurity')}
            onToggleNativeOnly={() => toggleSkipFlag('doctor', 'nativeOnly')}
            onToggleVerbose={() => toggleSkipFlag('doctor', 'verbose')}
            onToggleFix={() => toggleSkipFlag('doctor', 'fix')}
            onToggleDryRun={() => toggleSkipFlag('doctor', 'dryRun')}
            onRun={() => handleRunConfirm('doctor')}
          />
        }
      />
      <Route
        path="/skills"
        element={
          <SkillPickerScreen
            rootDir={rootDir}
            catalogSkills={catalogSkills}
            installedSkills={installedSkills}
            selectedSkills={skillPickerOwner ? options[skillPickerOwner]?.selectedSkills || [] : []}
            client={skillPickerClient}
            scope={skillPickerScope}
            onSetSelectedSkills={handleSetSelectedSkills}
          />
        }
      />
      <Route
        path="/confirm"
        element={<ConfirmScreen rootDir={rootDir} options={options} onRun={handleRun} />}
      />
    </Routes>
  );
}

export function App(props: TuiSessionProps) {
  const [exitRequested, setExitRequested] = useState(false);

  const handleExit = useCallback(() => {
    setExitRequested(true);
  }, []);

  if (exitRequested) {
    return (
      <Box padding={1}>
        <Text>Goodbye!</Text>
      </Box>
    );
  }

  return (
    <MemoryRouter>
      <AppContent {...props} onExit={handleExit} />
    </MemoryRouter>
  );
}
