export const TEAM = Object.freeze({ VILLAGE: 'village', WOLVES: 'wolves' });

export const ROLES = Object.freeze({
  villager:  { id: 'villager',  name: 'Villager',  team: TEAM.VILLAGE, nightPrompt: 'Who do you suspect?' },
  werewolf:  { id: 'werewolf',  name: 'Werewolf',  team: TEAM.WOLVES,  nightPrompt: 'Who do you want to kill?' },
  seer:      { id: 'seer',      name: 'Seer',      team: TEAM.VILLAGE, nightPrompt: 'Who do you want to check?' },
  bodyguard: { id: 'bodyguard', name: 'Bodyguard', team: TEAM.VILLAGE, nightPrompt: 'Who do you want to protect?' },
});

export const teamOf = (roleId) => ROLES[roleId].team;
export const isWolf = (roleId) => roleId === 'werewolf';
