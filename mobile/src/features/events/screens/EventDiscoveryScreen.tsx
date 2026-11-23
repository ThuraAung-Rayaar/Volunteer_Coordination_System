/**
 * @format
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import type { EventRepository } from '../../../data/contracts/eventRepository';
import {
  defaultEventRepository,
  MockEventRepository,
} from '../../../data/mock/MockEventRepository';
import { useRepositories } from '../../../app/RepositoryProvider';
import {
  EventFilters,
  EventSummary,
} from '../../../domain/models/event';
import { appEventBus, AppEvents } from '../../../core/events/eventBus';
import type { MainDrawerScreenProps } from '../../../navigation/navigationTypes';
import {
  AppButton,
  AppHeader,
  AppIcon,
  AppText,
  EmptyState,
  ErrorState,
  LoadingState,
  SearchInput,
} from '../../../shared';
import { useAppTheme } from '../../../theme';
import {
  EventCard,
  EventFilterSheet,
} from '../components';

export interface DiscoveryStateCache {
  searchQuery: string;
  activeFilters: EventFilters;
  scrollOffset: number;
}

let discoveryCache: DiscoveryStateCache = {
  searchQuery: '',
  activeFilters: {},
  scrollOffset: 0,
};

export function resetDiscoveryCache(): void {
  discoveryCache = {
    searchQuery: '',
    activeFilters: {},
    scrollOffset: 0,
  };
}

export function getDiscoveryCache(): DiscoveryStateCache {
  return { ...discoveryCache };
}

export interface EventDiscoveryScreenProps
  extends Partial<MainDrawerScreenProps<'Events'>> {
  repository?: EventRepository;
}

export function EventDiscoveryScreen({
  navigation,
  repository: propRepository,
}: EventDiscoveryScreenProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const repositories = useRepositories();
  const repository = propRepository ?? repositories.eventRepository ?? defaultEventRepository;

  const [searchQuery, setSearchQuery] = useState(() => discoveryCache.searchQuery);
  const [activeFilters, setActiveFilters] = useState<EventFilters>(
    () => discoveryCache.activeFilters,
  );
  const [isFilterSheetVisible, setIsFilterSheetVisible] = useState(false);

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const flatListRef = useRef<FlatList<EventSummary>>(null);

  // Compute combined filter query
  const effectiveFilters = useMemo((): EventFilters => {
    return {
      ...activeFilters,
      query: searchQuery.trim().length > 0 ? searchQuery : undefined,
    };
  }, [activeFilters, searchQuery]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeFilters.statuses && activeFilters.statuses.length > 0) {
      count += activeFilters.statuses.length;
    }
    if (
      activeFilters.charityFieldCodes &&
      activeFilters.charityFieldCodes.length > 0
    ) {
      count += activeFilters.charityFieldCodes.length;
    }
    if (activeFilters.mealsProvided) {
      count += 1;
    }
    if (activeFilters.lodgingProvided) {
      count += 1;
    }
    if (activeFilters.travelSupportProvided) {
      count += 1;
    }
    return count;
  }, [activeFilters]);

  const fetchEvents = useCallback(async () => {
    try {
      setErrorMessage(null);
      const data = await repository.getEvents(effectiveFilters);
      setEvents(data);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load volunteer events',
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [effectiveFilters, repository]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Re-fetch events when tab/screen gains focus or when an event status changes across tabs
  useEffect(() => {
    const unsubFocus = navigation?.addListener?.('focus', () => {
      fetchEvents();
    });
    const unsubBus = appEventBus.on(AppEvents.EVENT_STATUS_CHANGED, () => {
      fetchEvents();
    });
    return () => {
      unsubFocus?.();
      unsubBus();
    };
  }, [navigation, fetchEvents]);

  // Restore scroll offset if returning to a populated list
  useEffect(() => {
    if (events.length > 0 && discoveryCache.scrollOffset > 0) {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToOffset({
          offset: discoveryCache.scrollOffset,
          animated: false,
        });
      });
    }
  }, [events.length]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchEvents();
  };

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    discoveryCache.searchQuery = text;
  };

  const handleApplyFilters = (newFilters: EventFilters) => {
    setActiveFilters(newFilters);
    discoveryCache.activeFilters = newFilters;
  };

  const handleClearAll = () => {
    setSearchQuery('');
    setActiveFilters({});
    discoveryCache.searchQuery = '';
    discoveryCache.activeFilters = {};
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    discoveryCache.scrollOffset = event.nativeEvent.contentOffset.y;
  };

  const handleEventPress = (eventId: string) => {
    if (navigation) {
      navigation.navigate('EventDetail', {
        eventId,
        returnTo: 'Events',
      });
    }
  };

  const hasAnyFilter = searchQuery.trim().length > 0 || activeFilterCount > 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title="Discover Events"
        subtitle="Public volunteer opportunities"
        onMenuPress={navigation ? () => navigation.openDrawer() : undefined}
      />

      {/* Single Search & Filter Row */}
      <View
        style={[
          styles.searchRow,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.searchInputWrapper}>
          <SearchInput
            value={searchQuery}
            onChangeText={handleSearchChange}
            onClear={() => handleSearchChange('')}
            placeholder="Search by title, location, or landmark..."
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Filter events. ${activeFilterCount} active filters.`}
          onPress={() => setIsFilterSheetVisible(true)}
          hitSlop={8}
          style={[
            styles.filterButton,
            {
              backgroundColor:
                activeFilterCount > 0
                  ? theme.colors.primary
                  : theme.colors.surfaceRaised,
              borderColor:
                activeFilterCount > 0
                  ? theme.colors.primary
                  : theme.colors.border,
              borderRadius: theme.radius.sm,
            },
          ]}
        >
          <AppIcon
            name="filter"
            size={18}
            color={
              activeFilterCount > 0
                ? theme.colors.onPrimary
                : theme.colors.textPrimary
            }
          />
          {activeFilterCount > 0 ? (
            <View
              style={[
                styles.filterBadge,
                { backgroundColor: theme.colors.accent },
              ]}
            >
              <AppText
                variant="caption"
                weight="bold"
                color={theme.colors.textPrimary}
                style={styles.filterBadgeText}
              >
                {activeFilterCount}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* Active Filters Summary Bar */}
      {hasAnyFilter ? (
        <View
          style={[
            styles.activeFiltersBar,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <AppText
            variant="caption"
            weight="semibold"
            color={theme.colors.textSecondary}
          >
            Showing filtered results ({events.length} found)
          </AppText>
          <AppButton
            label="Clear all"
            variant="ghost"
            onPress={handleClearAll}
            style={styles.clearAllButton}
          />
        </View>
      ) : null}

      {/* Content Area */}
      {isLoading ? (
        <LoadingState label="Loading published volunteer opportunities..." />
      ) : errorMessage ? (
        <ErrorState
          title="Could not load events"
          description={errorMessage}
          onRetry={fetchEvents}
        />
      ) : (
        <FlatList
          ref={flatListRef}
          data={events}
          keyExtractor={item => item.id}
          contentContainerStyle={[
            styles.listContent,
            { padding: theme.spacing.md },
          ]}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
            />
          }
          renderItem={({ item }) => (
            <EventCard event={item} onPress={handleEventPress} />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No events found"
              description={
                hasAnyFilter
                  ? 'No published or active events match your current search and filter criteria.'
                  : 'There are currently no published volunteer opportunities available.'
              }
              actionLabel={hasAnyFilter ? 'Reset Filters' : undefined}
              onActionPress={hasAnyFilter ? handleClearAll : undefined}
            />
          }
        />
      )}

      {/* Filter Sheet Modal */}
      <EventFilterSheet
        visible={isFilterSheetVisible}
        filters={activeFilters}
        onClose={() => setIsFilterSheetVisible(false)}
        onApply={handleApplyFilters}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  searchInputWrapper: {
    flex: 1,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 10,
    lineHeight: 12,
  },
  activeFiltersBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  clearAllButton: {
    minHeight: 28,
    paddingHorizontal: 8,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
});
