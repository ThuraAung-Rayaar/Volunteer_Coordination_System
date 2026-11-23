/**
 * @format
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import type { EventRepository } from '../../../data/contracts/eventRepository';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import { AppHeader } from '../../../shared';
import { useAppTheme } from '../../../theme';
import {
  VolunteerDynamicIsland,
  type VolunteerWorkspaceTab,
} from '../components';
import { MyApplicationsScreen } from './MyApplicationsScreen';
import { MyAssignmentsScreen } from './MyAssignmentsScreen';

export type { VolunteerWorkspaceTab };

export interface VolunteerWorkspaceScreenProps
  extends Partial<MainDrawerScreenProps<'VolunteerWorkspace'>> {
  repository?: EventRepository;
  initialTab?: VolunteerWorkspaceTab;
}

export function VolunteerWorkspaceScreen({
  navigation,
  route,
  repository,
  initialTab = 'applications',
}: VolunteerWorkspaceScreenProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const windowDims = useWindowDimensions();
  const screenWidth =
    windowDims.width > 0 ? windowDims.width : Dimensions.get('window').width;

  const [activeTab, setActiveTab] = useState<VolunteerWorkspaceTab>(
    route?.params?.initialTab ?? initialTab,
  );
  const scrollViewRef = useRef<any>(null);

  useEffect(() => {
    const target = route?.params?.initialTab ?? initialTab;
    if (target && target !== activeTab) {
      setActiveTab(target);
      scrollViewRef.current?.scrollTo({
        x: target === 'applications' ? 0 : screenWidth,
        animated: false,
      });
    }
  }, [route?.params?.initialTab, initialTab, screenWidth]);

  const handleTabPress = (tab: VolunteerWorkspaceTab) => {
    setActiveTab(tab);
    scrollViewRef.current?.scrollTo({
      x: tab === 'applications' ? 0 : screenWidth,
      animated: true,
    });
  };

  const handleMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / (screenWidth || 1));
    const newTab: VolunteerWorkspaceTab =
      page === 0 ? 'applications' : 'assignments';
    if (newTab !== activeTab) {
      setActiveTab(newTab);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title="Volunteer Workspace"
        subtitle={
          activeTab === 'applications'
            ? 'My Applications & Requests'
            : 'My Confirmed Shifts & Assignments'
        }
        onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
      />

      {/* Main Content Area with Native Horizontal Paging & Swipe Support */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        onMomentumScrollEnd={handleMomentumScrollEnd}
        style={styles.contentArea}
      >
        <View style={{ width: screenWidth, flex: 1 }}>
          <MyApplicationsScreen
            navigation={navigation as any}
            repository={repository}
            hideHeader
          />
        </View>
        <View style={{ width: screenWidth, flex: 1 }}>
          <MyAssignmentsScreen
            navigation={navigation as any}
            repository={repository}
            hideHeader
          />
        </View>
      </ScrollView>

      {/* Dynamic Floating Tab Island */}
      <VolunteerDynamicIsland
        activeTab={activeTab}
        onTabPress={handleTabPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  contentArea: {
    flex: 1,
  },
});
