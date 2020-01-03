const LauncherPartyMeta = require('epicgames-client/src/Party/PartyMeta');

class PartyMeta extends LauncherPartyMeta {

  constructor(party, meta) {
    super(party);
    
    this.schema = {
      /* Fixed schema a little, from Kekistanz */
      AllowJoinInProgress_b: 'false',
      AthenaSquadFill_b: 'true',
      CustomMatchKey_s: '',
      GameSessionKey_s: '',
      LFGTime_s: '0001-01-01T00:00:00.000Z',
      LobbyConnectionStarted_b: 'false',
      MatchmakingInfoString_s: '',
      MatchmakingResult_s: 'NoResults',
      MatchmakingState_s: 'NotMatchmaking',
      PartyIsJoinedInProgress_b: 'false',
      PartyState_s: 'BattleRoyaleView',
      PlatformSessions_j: JSON.stringify({
        PlatformSessions: [],
      }),
      PlaylistData_j: JSON.stringify({
        PlaylistData: {
          playlistName: 'Playlist_DefaultSolo',
          tournamentId: '',
          eventWindowId: '',
          regionId: 'EU',
        },
      }),
      PrimaryGameSessionId_s: '',
      PrivacySettings_j: JSON.stringify({
        PrivacySettings: {
          partyType: this.party.config.privacy.partyType,
          partyInviteRestriction: this.party.config.privacy.inviteRestriction,
          bOnlyLeaderFriendsCanJoin: this.party.config.privacy.onlyLeaderFriendsCanJoin,
        },
      }),
      RawSquadAssignments_j: '',
     /*
      PartyMatchmakingInfo_j: JSON.stringify({
        PartyMatchmakingInfo: {
          buildId: -1,
          hotfixVersion: -1,
          regionId: "",
          playlistName :"None",
          tournamentId: "",
          eventWindowId: "",
          linkCode: "",
        },
      }),
      */
      SessionIsCriticalMission_b: 'false',
      TheaterId_s: '',
      TileStates_j: JSON.stringify({
        TileStates: [],
      }),
      ["urn:epic:cfg:accepting-members_b"]: "true",
      ["urn:epic:cfg:build-id_s"]: "1:1:",
      ["urn:epic:cfg:chat-enabled_b"]: "true",
      ["urn:epic:cfg:invite-perm_s"]: "Anyone",
      ["urn:epic:cfg:join-request-action_s"]: "Manual",
      ["urn:epic:cfg:party-type-id_s"]: "default",
      ["urn:epic:cfg:presence-perm_s"]: "Anyone",
      ZoneInstanceId_s: '',
      ZoneTileIndex_U: '-1',
    };

    if (meta) this.update(meta, true);
    this.refreshSquadAssignments();

  }

  refreshSquadAssignments() {
    const assignments = [];
    let i = 0;
    this.party.members.forEach((member) => {
      if (member.role === 'CAPTAIN') {
        assignments.push({
          memberId: member.id,
          absoluteMemberIdx: 0,
        });
      } else {
        i += 1;
        assignments.push({
          memberId: member.id,
          absoluteMemberIdx: i,
        });
      }
    });
    return this.set('RawSquadAssignments_j', {
      RawSquadAssignments: assignments,
    });
  }

  async setCustomMatchKey(key) {
    await this.party.patch({
      CustomMatchKey_s: this.set('CustomMatchKey_s', key || ''),
    });
  }

  async setAllowJoinInProgress(canJoin) {
    await this.party.patch({
      AllowJoinInProgress_b: this.set('AllowJoinInProgress_b', !!canJoin),
    });
  }

  async setPlaylist(regionId, playlistName, tournamentId, eventWindowId) {
    if (!regionId) throw new Error('Wrong region id!');
    if (!playlistName) throw new Error('Wrong playlist name!');
    await this.party.patch({
      PlaylistData_j: this.set('PlaylistData_j', {
        PlaylistData: {
          playlistName,
          tournamentId: tournamentId || '',
          eventWindowId: eventWindowId || '',
          regionId,
        },
      }),
    });
  }
  
}

module.exports = PartyMeta;
