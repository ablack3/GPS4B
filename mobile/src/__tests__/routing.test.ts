import { buildRouteRequest } from '../routing';

const from = { latitude: 42.3601, longitude: -71.0589 };
const to = { latitude: 42.3736, longitude: -71.1097 };

describe('buildRouteRequest', () => {
  it('asks for stock bicycle routing in kilometers', () => {
    const body = buildRouteRequest(from, to);

    expect(body).toEqual({
      locations: [
        { lat: 42.3601, lon: -71.0589 },
        { lat: 42.3736, lon: -71.1097 },
      ],
      costing: 'bicycle',
      units: 'kilometers',
    });
  });

  it('omits cost factors entirely when none are supplied', () => {
    expect('linear_cost_factors' in buildRouteRequest(from, to)).toBe(false);
    expect('linear_cost_factors' in buildRouteRequest(from, to, {})).toBe(false);
    expect(
      'linear_cost_factors' in buildRouteRequest(from, to, { costFactors: [] })
    ).toBe(false);
  });

  // The Segment Score milestone weights routing by rider-contributed safety
  // data. Per ADR 0001 that must land as a request parameter, not a
  // re-platforming — this test pins that seam open.
  it('carries per-edge cost factors through as linear_cost_factors', () => {
    const costFactors = [
      { edge_id: 1234, cost_factor: 0.6 },
      { edge_id: 5678, cost_factor: 2.5 },
    ];

    const body = buildRouteRequest(from, to, { costFactors });

    expect(body.linear_cost_factors).toEqual(costFactors);
    expect(body.costing).toBe('bicycle');
  });
});
