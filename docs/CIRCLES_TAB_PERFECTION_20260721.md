# CalledOut Circles tab perfection

## Product goal
Circles must answer one question immediately: **who will notice whether you show up?**

The completed flow reinforces the CalledOut loop:

1. Make a promise inside a private circle.
2. Submit fresh proof.
3. Members see whether the promise was kept.
4. A miss appears on that circle's Wall.
5. Redemption answers the callout but never erases the miss.

## Mobile changes
- Rebuilt the Circles tab around private accountability teams rather than a basic list.
- Added circle-level member, consistency, open-callout, upcoming-promise, and activity summaries.
- Added an Overview / Members / Activity information architecture.
- Added a 30-day circle leaderboard based on completion rate, then fewer misses.
- Added upcoming promises and a direct Circle Wall route.
- Added deep-linkable invite codes and clearer privacy disclosure.
- Expanded circle creation with icon, purpose, rules, and plan-aware member limits.
- Added full management for owners and moderators:
  - edit name, icon, description, and rules;
  - rotate invite codes;
  - promote or demote moderators;
  - remove members;
  - leave or delete a circle safely.

## Data integrity rules
- Leaving or removing a member detaches future schedules from the circle.
- Future promises whose proof windows have not opened become private.
- Promises whose proof windows already opened remain accountable to the circle.
- Historical misses are never silently erased.
- Deleting a circle removes access while preserving account-level historical records.

## Database
Migration: `20260721110000_circles_perfection.sql`

New RPCs:
- `create_circle_v2`
- `update_circle_details`
- `rotate_circle_invite`
- `leave_circle`
- `remove_circle_member`
- `set_circle_member_role`
- `delete_circle`
