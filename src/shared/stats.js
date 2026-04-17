// In-memory stats counters
const state = {
  totalResponses: 0,
  breakerTrips: 0,
  perUser: new Map(), // userId -> count
};

export function recordResponse(userId) {
  state.totalResponses++;
  if (userId) state.perUser.set(userId, (state.perUser.get(userId) ?? 0) + 1);
}

export function recordBreakerTrip() {
  state.breakerTrips++;
}

export function getStats() {
  return {
    totalResponses: state.totalResponses,
    breakerTrips: state.breakerTrips,
    perUser: new Map(state.perUser),
  };
}
