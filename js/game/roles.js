export const TEAM = Object.freeze({ VILLAGE: 'village', WOLVES: 'wolves', JESTER: 'jester' });

export const ROLES = Object.freeze({
  villager:  { id: 'villager',  name: 'Villager',  team: TEAM.VILLAGE, nightPrompt: 'Who do you suspect?' },
  werewolf:  { id: 'werewolf',  name: 'Werewolf',  team: TEAM.WOLVES,  nightPrompt: 'Who do you want to kill?' },
  wolfcub:   { id: 'wolfcub',   name: 'Wolf Cub',  team: TEAM.WOLVES,  nightPrompt: 'Who do you want to kill?' },
  seer:      { id: 'seer',      name: 'Seer',      team: TEAM.VILLAGE, nightPrompt: 'Who do you want to check?' },
  bodyguard: { id: 'bodyguard', name: 'Bodyguard', team: TEAM.VILLAGE, nightPrompt: 'Who do you want to protect?' },
  hunter:    { id: 'hunter',    name: 'Hunter',    team: TEAM.VILLAGE, nightPrompt: 'Who do you suspect?' },
  prince:    { id: 'prince',    name: 'Prince',    team: TEAM.VILLAGE, nightPrompt: 'Who do you suspect?' },
  witch:     { id: 'witch',     name: 'Witch',     team: TEAM.VILLAGE, nightPrompt: 'Use a potion?' },
  jester:    { id: 'jester',    name: 'Jester',    team: TEAM.JESTER,  nightPrompt: 'Who do you suspect?' },
});

export const teamOf = (roleId) => ROLES[roleId].team;
// Wolf cubs are on the wolf team and show up as wolves to the seer.
export const isWolf = (roleId) => roleId === 'werewolf' || roleId === 'wolfcub';
// Roles with no night power: they get a decoy "suspect" prompt so nobody can tell who is who.
export const isDecoy = (roleId) => ['villager', 'hunter', 'prince', 'jester'].includes(roleId);
