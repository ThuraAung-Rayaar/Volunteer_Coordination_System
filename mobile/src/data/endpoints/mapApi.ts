/**
 * @format
 * Client endpoints for Map Catalog, MapLibre raster style, and offline regional packages.
 */

import { ApiClient, defaultApiClient } from '../../core/api/apiClient';
import { ApiResult } from '../../core/api/apiResult';

export interface RegionTileStatsDto {
  tile_count: number;
  real_raster_tile_count: number;
  placeholder_tile_count: number;
  min_zoom?: number | null;
  max_zoom?: number | null;
}

export interface MapRegionConfigDto {
  code: string;
  name: string;
  bounds: [[number, number], [number, number]]; // [[south, west], [north, east]]
  center: [number, number]; // [lat, lon]
  default_zoom: number;
}

export interface MapCatalogResponseDto {
  status: string;
  style_url: string;
  tile_provider_configured: boolean;
  tile_attribution: string;
  offline_downloads_enabled: boolean;
  regions: Record<string, MapRegionConfigDto>;
  region_tile_stats: Record<string, RegionTileStatsDto>;
  macro?: MapRegionConfigDto;
}

export const mapApi = {
  getMapCatalog(client: ApiClient = defaultApiClient): Promise<ApiResult<MapCatalogResponseDto>> {
    return client.get<MapCatalogResponseDto>('/api/v1/maps/catalog/');
  },
};
