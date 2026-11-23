/**
 * @format
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { CoordinatorRepository } from '../../../data/contracts/coordinatorRepository';
import { defaultCoordinatorRepository } from '../../../data/mock/MockCoordinatorRepository';
import { useRepositories } from '../../../app/RepositoryProvider';
import type {
  CoordinatorEventStatus,
  CoordinatorEventSummary,
} from '../../../domain/models/coordinator';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import {
  AppButton,
  AppHeader,
  EmptyState,
  ErrorState,
  FilterChip,
  LoadingState,
} from '../../../shared';
import { useAppTheme } from '../../../theme';
import {
  CoordinatorEventCard,
  CoordinatorGuard,
} from '../components';

export interface CoordinatorEventsScreenProps
  extends Partial<MainDrawerScreenProps<'CoordinatorEvents'>> {
  repository?: CoordinatorRepository;
}

type FilterStatus = 'all' | CoordinatorEventStatus | 'monitor';

export function CoordinatorEventsScreen({
  navigation,
  repository: propRepository,
}: CoordinatorEventsScreenProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const repositories = useRepositories();
  const repository = propRepository ?? repositories.coordinatorRepository ?? defaultCoordinatorRepository;

  const [events, setEvents] = useState<CoordinatorEventSummary[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<FilterStatus>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setErrorMessage(null);
      const data = await repository.getMyEvents();
      setEvents(data);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load coordinator events',
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [repository]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchEvents();
  };

  const filteredEvents = useMemo(() => {
    // Cancelled events must not appear in any tab
    const validEvents = events.filter(e => e.status !== 'cancelled');

    if (selectedFilter === 'all') {
      // Completed events only appear under completed filter (history), not in general active/published list
      return validEvents.filter(e => e.status !== 'completed');
    }
    if (selectedFilter === 'monitor') {
      return validEvents.filter(e => e.isOwnerAsMonitor && e.status !== 'completed');
    }
    return validEvents.filter(e => e.status === selectedFilter);
  }, [events, selectedFilter]);

  const handleEventPress = (eventId: string) => {
    navigation?.navigate?.('CoordinatorEventDetail', { eventId });
  };

  const handleBack = () => {
    if (navigation && navigation.canGoBack()) {
      navigation.goBack();
    } else if (navigation) {
      navigation.navigate('CoordinatorWorkspace');
    }
  };

  return (
    <CoordinatorGuard navigation={navigation}>
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader
          title="Coordinator Events"
          subtitle="Managed volunteer projects"
          onBackPress={handleBack}
          rightAction={
            <AppButton
              label="+ New"
              variant="outline"
              onPress={() => navigation?.navigate?.('CreateEventWizard')}
              style={styles.newButton}
            />
          }
        />

        {/* Filter Chips Horizontal Bar */}
        <View
          style={[
            styles.filterBar,
            {
              backgroundColor: theme.colors.surface,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            <FilterChip
              label="All Events"
              selected={selectedFilter === 'all'}
              onPress={() => setSelectedFilter('all')}
            />
            <FilterChip
              label="Active"
              selected={selectedFilter === 'active'}
              onPress={() => setSelectedFilter('active')}
            />
            <FilterChip
              label="Published"
              selected={selectedFilter === 'published'}
              onPress={() => setSelectedFilter('published')}
            />
            <FilterChip
              label="Draft"
              selected={selectedFilter === 'draft'}
              onPress={() => setSelectedFilter('draft')}
            />
            <FilterChip
              label="Monitor Mode"
              selected={selectedFilter === 'monitor'}
              onPress={() => setSelectedFilter('monitor')}
            />
            <FilterChip
              label="Completed"
              selected={selectedFilter === 'completed'}
              onPress={() => setSelectedFilter('completed')}
            />
          </ScrollView>
        </View>

        {/* Event List */}
        {isLoading ? (
          <LoadingState label="Loading managed events..." />
        ) : errorMessage ? (
          <ErrorState
            title="Events Unavailable"
            description={errorMessage}
            onRetry={fetchEvents}
          />
        ) : (
          <FlatList
            data={filteredEvents}
            keyExtractor={item => item.id}
            contentContainerStyle={[
              styles.listContent,
              { padding: theme.spacing.md },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={theme.colors.primary}
              />
            }
            renderItem={({ item }) => (
              <CoordinatorEventCard
                event={item}
                onPress={handleEventPress}
              />
            )}
            ListEmptyComponent={
              <EmptyState
                icon="calendar"
                title="No Events Found"
                description={
                  selectedFilter !== 'all'
                    ? 'No events match the selected status filter.'
                    : 'You have not created or been assigned any coordinator events.'
                }
                actionLabel={
                  selectedFilter !== 'all' ? 'Show All Events' : undefined
                }
                onActionPress={
                  selectedFilter !== 'all'
                    ? () => setSelectedFilter('all')
                    : undefined
                }
              />
            }
          />
        )}
      </View>
    </CoordinatorGuard>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  newButton: {
    minHeight: 32,
    paddingHorizontal: 12,
  },
  filterBar: {
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 30,
  },
});
