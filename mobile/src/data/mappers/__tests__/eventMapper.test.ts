/**
 * @format
 */

import {
  mapApplicationSubmitRequest,
  mapPublicEventDetail,
  mapPublicEventPost,
  mapPublicEventSummary,
  mapVolunteerApplication,
  mapVolunteerAssignment,
} from '../eventMapper';
import type {
  PublicEventDetailDto,
  PublicEventDto,
  PublicEventPostDto,
  VolunteerApplicationDto,
  VolunteerAssignmentDto,
} from '../../dto/eventDto';

describe('eventMapper', () => {
  const sampleEventDto: PublicEventDto = {
    id: 101,
    title: 'Yangon River Cleanup',
    description: 'Community cleanup initiative along the riverfront.',
    purpose_type: 'charity_event',
    location_name: 'Botahtaung Jetty',
    landmark_text: 'Near Jetty Gate 3',
    latitude: '16.7681',
    longitude: '96.1662',
    geo_radius_m: 150,
    geo_checkin_enabled: true,
    map_provider: 'openstreetmap',
    start_at: '2026-12-01T08:00:00+06:30',
    end_at: '2026-12-01T12:00:00+06:30',
    application_deadline: '2026-11-28T23:59:59+06:30',
    status: 'active',
    acceptance_mode: 'manual',
    max_participants: 50,
    meals_provided: true,
    lodging_provided: false,
    travel_support_provided: true,
    compensation_kind: 'unpaid',
    coordinator_name: 'Daw Khin',
    charity_fields: ['environment', 'cleaning'],
    spots_remaining: 18,
  };

  it('maps PublicEventDto to domain EventSummary correctly', () => {
    const summary = mapPublicEventSummary(sampleEventDto);

    expect(summary.id).toBe('101');
    expect(summary.title).toBe('Yangon River Cleanup');
    expect(summary.status).toBe('active');
    expect(summary.locationName).toBe('Botahtaung Jetty');
    expect(summary.landmarkText).toBe('Near Jetty Gate 3');
    expect(summary.charityFields).toEqual(['environment', 'cleaning']);
    expect(summary.coordinatorName).toBe('Daw Khin');
    expect(summary.spotsRemaining).toBe(18);
    expect(summary.mealsProvided).toBe(true);
    expect(summary.lodgingProvided).toBe(false);
    expect(summary.travelSupportProvided).toBe(true);
    expect(summary.compensationKind).toBe('unpaid');
  });

  it('handles null and undefined fields gracefully in EventSummary', () => {
    const minimalDto: PublicEventDto = {
      ...sampleEventDto,
      description: null,
      location_name: null,
      landmark_text: null,
      application_deadline: null,
      coordinator_name: null,
      status: 'unknown_future_status',
    };

    const summary = mapPublicEventSummary(minimalDto);
    expect(summary.description).toBe('');
    expect(summary.locationName).toBe('');
    expect(summary.landmarkText).toBeUndefined();
    expect(summary.applicationDeadline).toBeUndefined();
    expect(summary.coordinatorName).toBe('Coordinator');
    expect(summary.status).toBe('published'); // normalized fallback
  });

  it('maps PublicEventPostDto to domain EventPost correctly', () => {
    const postDto: PublicEventPostDto = {
      id: 501,
      title: 'Waste Sorting Team Leader',
      description: 'Coordinates waste sorting bins',
      status: 'open',
      physical_level: 'medium',
      required_skills: ['Sorting', 'Team Leadership'],
      leader_needed: true,
      new_volunteers_allowed: false,
      required_headcount: 5,
      assigned_count: 2,
      remaining: 3,
    };

    const post = mapPublicEventPost(postDto, '101');
    expect(post.id).toBe('501');
    expect(post.eventId).toBe('101');
    expect(post.title).toBe('Waste Sorting Team Leader');
    expect(post.requiredHeadcount).toBe(5);
    expect(post.filledHeadcount).toBe(2);
    expect(post.remainingCapacity).toBe(3);
    expect(post.physicalLevel).toBe('medium');
    expect(post.leaderNeeded).toBe(true);
    expect(post.newVolunteersAllowed).toBe(false);
  });

  it('maps PublicEventDetailDto and binds userApplication when present', () => {
    const detailDto: PublicEventDetailDto = {
      ...sampleEventDto,
      posts: [
        {
          id: 501,
          title: 'General Support',
          description: null,
          status: 'open',
          physical_level: 'light',
          required_skills: [],
          leader_needed: false,
          new_volunteers_allowed: true,
          required_headcount: 10,
          assigned_count: 4,
          remaining: 6,
        },
      ],
      compensation_note: 'Water and gloves provided on site',
    };

    const appDto: VolunteerApplicationDto = {
      id: 701,
      event_id: 101,
      event_title: 'Yangon River Cleanup',
      event_status: 'active',
      post_id: 501,
      post_title: 'General Support',
      source: 'browse',
      status: 'accepted',
      applied_at: '2026-11-20T10:00:00+06:30',
      decided_at: '2026-11-21T12:00:00+06:30',
      note: 'Available all morning',
    };

    const detail = mapPublicEventDetail(detailDto, appDto);
    expect(detail.id).toBe('101');
    expect(detail.posts).toHaveLength(1);
    expect(detail.posts[0].id).toBe('501');
    expect(detail.compensationNote).toBe('Water and gloves provided on site');
    expect(detail.latitude).toBe(16.7681);
    expect(detail.longitude).toBe(96.1662);
    expect(detail.geoCheckinEnabled).toBe(true);
    expect(detail.userApplication).not.toBeNull();
    expect(detail.userApplication?.status).toBe('accepted');
    expect(detail.userApplication?.volunteerNote).toBe('Available all morning');
  });

  it('maps VolunteerApplicationDto to domain VolunteerApplicationItem', () => {
    const appDto: VolunteerApplicationDto = {
      id: 88,
      event_id: 101,
      event_title: null,
      event_status: 'active',
      post_id: null,
      post_title: null,
      source: 'browse',
      status: 'pending',
      applied_at: '2026-11-15T14:30:00+06:30',
      decided_at: null,
      note: 'Excited to join',
    };

    const item = mapVolunteerApplication(appDto);
    expect(item.id).toBe('88');
    expect(item.eventId).toBe('101');
    expect(item.eventTitle).toBe('Volunteer Event'); // default fallback
    expect(item.postTitle).toBe('General Volunteer Support'); // default fallback
    expect(item.status).toBe('pending');
    expect(item.volunteerNote).toBe('Excited to join');
  });

  it('maps VolunteerAssignmentDto to domain VolunteerAssignmentItem truthfully', () => {
    const assignDto: VolunteerAssignmentDto = {
      id: 42,
      application_id: 88,
      event_id: 101,
      event_title: 'Food Pack Assembly',
      event_status: 'active',
      location_name: 'Yangon Central Hall',
      post_id: 202,
      post_title: 'Food Packing Leader',
      group_code: 'GRP-A',
      is_group_leader: true,
      status: 'confirmed',
      assigned_at: '2026-11-28T10:00:00+06:30',
      schedule_start: '2026-12-05T09:00:00+06:30',
      schedule_end: '2026-12-05T13:00:00+06:30',
      confirmed_at: '2026-11-30T10:00:00+06:30',
      attendance_id: 999,
      attendance_status: 'checked_in',
    };

    const item = mapVolunteerAssignment(assignDto);
    expect(item.id).toBe('42');
    expect(item.applicationId).toBe('88');
    expect(item.eventId).toBe('101');
    expect(item.eventTitle).toBe('Food Pack Assembly');
    expect(item.location).toBe('Yangon Central Hall');
    expect(item.postId).toBe('202');
    expect(item.postTitle).toBe('Food Packing Leader');
    expect(item.status).toBe('confirmed');
    expect(item.startAt).toBe('2026-12-05T09:00:00+06:30');
    expect(item.endAt).toBe('2026-12-05T13:00:00+06:30');
    expect(item.assignedAt).toBe('2026-11-28T10:00:00+06:30');
    expect(item.attendanceId).toBe('999');
    expect(item.attendanceStatus).toBe('checked_in');
  });

  it('generates allow-listed ApplicationSubmitRequestDto', () => {
    const payload = mapApplicationSubmitRequest('101', '501', '  I can help lift heavy items  ');
    expect(payload).toEqual({
      event_id: 101,
      post_id: 501,
      source: 'browse',
      note: 'I can help lift heavy items',
    });

    const payloadNullNote = mapApplicationSubmitRequest(101, null, '   ');
    expect(payloadNullNote).toEqual({
      event_id: 101,
      post_id: null,
      source: 'browse',
      note: null,
    });
  });
});
