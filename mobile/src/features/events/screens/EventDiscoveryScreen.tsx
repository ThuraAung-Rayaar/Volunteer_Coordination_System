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
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { EventRepository } from '../../../data/contracts/eventRepository';
import {
  defaultEventRepository,
  MockEventRepository,
} from '../../../data/mock/MockEventRepository';
import { useRepositories } from '../../../app/RepositoryProvider';
import { useCurrentUser } from '../../../app/UserContext';
import {
  EventFilters,
  EventSummary,
  RecommendedEvent,
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
  const { currentUser } = useCurrentUser();
  const repositories = useRepositories();
  const repository = propRepository ?? repositories.eventRepository ?? defaultEventRepository;

  const [searchQuery, setSearchQuery] = useState(() => discoveryCache.searchQuery);
  const [activeFilters, setActiveFilters] = useState<EventFilters>(
    () => discoveryCache.activeFilters,
  );
  const [isFilterSheetVisible, setIsFilterSheetVisible] = useState(false);

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendedEvent[]>([]);
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

  const fetchRecommendations = useCallback(
    async (forceRefresh = false) => {
      if (!currentUser || !repository.getRecommendations) {
        setRecommendations([]);
        return;
      }
      try {
        const recs = await repository.getRecommendations(10, forceRefresh);
        setRecommendations(recs);
      } catch {
        // Silent graceful fallback for unauthenticated, network error, or empty recommendations
        setRecommendations([]);
      }
    },
    [currentUser, repository],
  );

  const fetchEvents = useCallback(
    async (forceRefresh = false) => {
      try {
        setErrorMessage(null);
        const [data] = await Promise.all([
          repository.getEvents(effectiveFilters, forceRefresh),
          fetchRecommendations(forceRefresh),
        ]);
        setEvents(data);
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to load volunteer events',
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [effectiveFilters, repository, fetchRecommendations],
  );

  useEffect(() => {
    fetchEvents(false);
  }, [fetchEvents]);

  // Re-fetch events when tab/screen gains focus or when an event status changes across tabs
  useEffect(() => {
    const unsubFocus = navigation?.addListener?.('focus', () => {
      fetchEvents(false);
    });
    const unsubBus = appEventBus.on(AppEvents.EVENT_STATUS_CHANGED, () => {
      fetchEvents(false);
    });
    const unsubApp = appEventBus.on(AppEvents.APPLICATION_STATUS_CHANGED, () => {
      fetchRecommendations(true);
    });
    return () => {
      unsubFocus?.();
      unsubBus();
      unsubApp();
    };
  }, [navigation, fetchEvents, fetchRecommendations]);

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
    fetchEvents(true);
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

  const renderRecommendationsHeader = () => {
    if (hasAnyFilter || recommendations.length === 0) {
      return null;
    }

    return (
      <View style={styles.recommendationsSection}>
        <View style={styles.recHeaderRow}>
          <AppIcon name="spark" size={16} color={theme.colors.accent} />
          <AppText variant="title" weight="bold" color={theme.colors.textPrimary}>
            Recommended For You
          </AppText>
          <View
            style={[
              styles.recBadge,
              { backgroundColor: theme.colors.surfaceRaised },
            ]}
          >
            <AppText
              variant="caption"
              weight="medium"
              color={theme.colors.textSecondary}
            >
              Personalized
            </AppText>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.recScrollContent}
        >
          {recommendations.map(item => (
            <Pressable
              key={String(item.event.eventId)}
              accessibilityRole="button"
              accessibilityLabel={`Recommended: ${item.event.title}. ${Math.round(item.matchScore)}% Match`}
              onPress={() => handleEventPress(String(item.event.eventId))}
              style={[
                styles.recCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.recCardTop}>
                <View
                  style={[
                    styles.recScoreBadge,
                    {
                      backgroundColor:
                        item.matchLabel === 'strong'
                          ? theme.colors.primary
                          : theme.colors.accent,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    weight="bold"
                    color={theme.colors.onPrimary}
                    style={styles.recScoreText}
                  >
                    {Math.round(item.matchScore)}% Match
                  </AppText>
                </View>
                <AppText
                  variant="caption"
                  weight="medium"
                  color={theme.colors.textSecondary}
                >
                  {item.matchLabel === 'strong' ? 'Strong Fit' : 'Moderate Fit'}
                </AppText>
              </View>

              <AppText
                variant="body"
                weight="bold"
                color={theme.colors.textPrimary}
                numberOfLines={2}
                style={styles.recTitle}
              >
                {item.event.title}
              </AppText>

              <AppText
                variant="caption"
                color={theme.colors.textSecondary}
                numberOfLines={1}
              >
                {item.event.locationName || 'Location TBA'}
              </AppText>

              {item.reasons && item.reasons.length > 0 ? (
                <View style={styles.recChipsContainer}>
                  {item.reasons.slice(0, 2).map((reason, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.recChip,
                        { backgroundColor: theme.colors.surfaceRaised },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        color={theme.colors.textSecondary}
                        numberOfLines={1}
                      >
                        {reason}
                      </AppText>
                    </View>
                  ))}
                </View>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.recAllHeader}>
          <AppText
            variant="body"
            weight="bold"
            color={theme.colors.textSecondary}
          >
            All Volunteer Opportunities ({events.length})
          </AppText>
        </View>
      </View>
    );
  };

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
          ListHeaderComponent={renderRecommendationsHeader}
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
  recommendationsSection: {
    marginBottom: 16,
  },
  recHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  recBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  recScrollContent: {
    gap: 12,
    paddingVertical: 4,
  },
  recCard: {
    width: 280,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  recCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recScoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  recScoreText: {
    fontSize: 11,
    lineHeight: 14,
  },
  recTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  recChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  recChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  recAllHeader: {
    marginTop: 16,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
});
