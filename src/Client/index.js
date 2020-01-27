const {
  WaitingRoom, Endpoints: LauncherEndpoint, Application,
} = require('epicgames-client');

const ENDPOINT = require('../../resources/Endpoint');

const Http = require('../Http');
const Item = require('../Inventory/Item');
const Inventory = require('../Inventory');

const SaveTheWorldSubGame = require('../SubGames/SaveTheWorld');
const BattleRoyaleSubGame = require('../SubGames/BattleRoyale');
const CreativeSubGame = require('../SubGames/Creative');

const ESubGame = require('../../enums/SubGame');

const Party = require('../Party');
const PartyMeta = require('../Party/PartyMeta');
const PartyMember = require('../Party/Member');
const PartyMemberMeta = require('../Party/MemberMeta');

const FORTNITE_AUTHORIZATION = 'ZWM2ODRiOGM2ODdmNDc5ZmFkZWEzY2IyYWQ4M2Y1YzY6ZTFmMzFjMjExZjI4NDEzMTg2MjYyZDM3YTEzZmM4NGQ=';

class App extends Application {

  static get Party() { return Party; }

  static get PartyMeta() { return PartyMeta; }

  static get PartyMember() { return PartyMember; }

  static get PartyMemberMeta() { return PartyMemberMeta; }

  constructor(launcher, config) {
    super(launcher, config);
    
    this.id = 'Fortnite';

    this.config = {
      build: '++Fortnite+Release-10.31-CL-8723043',
      engineBuild: '4.23.0-8723043+++Fortnite+Release-10.31',
      netCL: '', /* Parties don't need it. */
      partyBuildId: '1:1:',
      ...this.config,
    };
        
    this.http = new Http(this.config.http);
    this.http.setHeader('Accept-Language', this.launcher.http.getHeader('Accept-Language'));

    this.basicData = null;
    this.storeCatalog = null;
    this.inventory = new Inventory(this, []);

    this.auth = null;

    this.communicator = null;
    this.profiles = {};

    this.party = null;

    this.Party = App.Party;
    this.PartyMeta = App.PartyMeta;
    this.PartyMember = App.PartyMember;
    this.PartyMemberMeta = App.PartyMemberMeta;

    this.launcher.on('exit', this.onExit.bind(this));

  }

  async onExit() {
    if (this.party) await this.party.leave();
  }

  setLanguage(language) {
    this.http.setHeader('Accept-Language', language);
  }

  async init() {

    try {
            
      let wait = false;
      if (this.config.useWaitingRoom) {
        try {
          const waitingRoom = new WaitingRoom(this, ENDPOINT.WAITING_ROOM);
          wait = await waitingRoom.needWait();
        } catch (error) {
          this.debug.print(new Error(`WaitingRoom error: ${error}`));
          return false;
        }
      }
    
      if (wait) {
                    
        this.launcher.debug.print(`[init()] Problems with servers, need wait ${wait.expectedWait} seconds.`);
        const sto = setTimeout(() => {
          clearTimeout(sto);
          return this.init();
        }, wait.expectedWait * 1000);
    
      } else {

        const { data } = await this.http.sendGet(ENDPOINT.BASIC_DATA);
                
        if (data) {
          
          this.basicData = data;

          const login = await this.login();
        
          await this.updateProfile('common_public');
          await this.updateProfile('common_core');

          this.inventory.addItems(Object.keys(this.profiles.common_core.items).map(
            id => new Item(this, {
              ...this.profiles.common_core.items[id],
              id,
            }),
          ));
          
          if (this.config.useCommunicator) {
            this.communicator = new this.Communicator(this);
            await this.communicator.connect(this.auth.accessToken);
          }

          this.launcher.on('access_token_refreshed', async () => {

            await this.login(true);

            if (this.communicator) {
              await this.communicator.disconnect();
              await this.communicator.connect(this.auth.accessToken);
            }
          });

          if (this.communicator) {
            this.launcher.on('logouted', async () => {
              await this.communicator.disconnect(false, true);
            });
          }

          this.party = null;

          if (this.communicator && this.config.createPartyOnStart) { /* TODO - move it to subGame */
            const partyStatus = await this.Party.lookupUser(this, this.launcher.account.id);
            /*
             if (partyStatus.current.length > 0) {
               this.party = new this.Party(this, partyStatus.current[0]);
               await this.party.patch();
               this.party.updatePresence();
               this.launcher.debug.print(`Fortnite: You has joined to previous party#${this.party.id}.`);
             } else {
               this.party = await this.Party.create(this);
               this.launcher.debug.print(`Fortnite: Party#${this.party.id} has been created.`);
             }
             */

            if (partyStatus.current.length > 0) {
              this.party = new this.Party(this, partyStatus.current[0]);
              await this.party.leave();
              this.launcher.debug.print(`[Fortnite] You left previous party[${partyStatus.current[0].id}].`);
            }
            this.party = await this.Party.create(this);
            await this.communicator.joinRoom(`Party-${this.party.id}@muc.prod.ol.epicgames.com`);
            this.launcher.debug.print(`[Fortnite] Party[${this.party.id}] has been created.`);

          }

          return login;

        }

      }

    } catch (err) {

      if (typeof err === 'object') this.launcher.debug.print(err);
      else this.launcher.debug.print(new Error(err));

    }

    return false;
  }

  async getSummary() {
    const { data } = await this.http.sendGet(
      `https://friends-public-service-prod.ol.epicgames.com/friends/api/v1/${this.auth.accountId}/summary`,
      `${this.auth.tokenType} ${this.auth.accessToken}`,
    );
    return data;
  }

    /**
   * @param {Object} friend What friend should the alias be set to
   * @param {string} alias What alias
   */
  async setAlias(friend, alias) {
    const fnd = await this.launcher.getProfile(friend);
    const { data } = await this.http.send(
      `PUT`,
      `https://friends-public-service-prod.ol.epicgames.com/friends/api/v1/${this.auth.accountId}/friends/${fnd.id}/alias`,
      `${this.auth.tokenType} ${this.auth.accessToken}`,
      alias,
      false,
      {
        'Content-Type': "text/plain"
      },
      true,
    );
    return data;
  }
  
      /**
   * @param {Object} friend What friend should the note be set to
   * @param {string} note What note
   */
  async setNote(friend, note) {
    const fnd = await this.launcher.getProfile(friend);
    const data = await this.http.send(
      `PUT`,
      `https://friends-public-service-prod.ol.epicgames.com/friends/api/v1/${this.auth.accountId}/friends/${fnd.id}/note`,
      `${this.auth.tokenType} ${this.auth.accessToken}`,
      note,
      false,
      {
        'Content-Type': "text/plain"
      },
      true,
    );
    return data;
  }

        /**
   * @param {Object} friend What friend should the note be removed from
   */
  async removeNote(friend) {
    const fnd = await this.launcher.getProfile(friend);
    const data = await this.http.send(
      `DELETE`,
      `https://friends-public-service-prod.ol.epicgames.com/friends/api/v1/${this.auth.accountId}/friends/${fnd.id}/note`,
      `${this.auth.tokenType} ${this.auth.accessToken}`,
    );
    return data;
  }

          /**
   * @param {Object} friend What friend should the nickame be removed from
   */
  async removeNickname(friend) {
    const fnd = await this.launcher.getProfile(friend);
    const data = await this.http.send(
      `DELETE`,
      `https://friends-public-service-prod.ol.epicgames.com/friends/api/v1/${this.auth.accountId}/friends/${fnd.id}/alias`,
      `${this.auth.tokenType} ${this.auth.accessToken}`,
    );
    return data;
  }

        async getLastOnline() {
          const { data } = await this.http.sendGet(
            `https://presence-public-service-prod.ol.epicgames.com/presence/api/v1/_/${this.auth.accountId}/last-online`,
            `${this.auth.tokenType} ${this.auth.accessToken}`,
          );
          return data;
        }

  /**
   * @param {Object} action what to do 
   * @param {string} info what should it do with the action
   * @param {string} color if needed.
   */
  async graphql(action, info, color) {

                  switch(action) {

                  case 'account_graphql_get_multiple_by_user_id' || 'getMultiple': {
                    
                    if(!info) return;

                    const { data } = await this.http.send(
                      'POST',
                      `https://graphql.epicgames.com/graphql`,
                      `${this.launcher.account.auth.tokenType} ${this.launcher.account.auth.accessToken}`,
                      JSON.stringify({"query":`
                      query AccountQuery($accountIds: [String]!) {
                        Account {
                            accounts(accountIds: $accountIds) {
                                id
                                displayName
                                externalAuths {
                                    type
                                    accountId
                                    externalAuthId
                                    externalDisplayName
                                }
                            }
                        }
                    }
                      `,"variables":{'accountIds': info}}),
                      false,
                      {
                        'Content-Type': "application/json"
                      },
                      true,
                      )

                      return data;
                  }

                case 'alias' || 'graphql_friends_set_alias': {

                  const Friend = await this.getProfile(info);

                  const { data } = await this.http.send(
                    'POST',
                    `https://graphql.epicgames.com/graphql`,
                    `${this.launcher.account.auth.tokenType} ${this.launcher.account.auth.accessToken}`,
                    JSON.stringify({"query":`
                    mutation FriendsMutation($friendId: String!, $alias: String!) {
                      Friends {
                          setAlias(friendId: $friendId, alias: $alias) {
                              success
                          }
                      }
                    }`
                    ,
                  "variables": {
                    "friendId": Friend.id,
                      "alias": color
                    }
                    }),
                    false,
                    {
                      'Content-Type': "application/json"
                    },
                    true,
                    )

                    return data
                  }

                  case 'summary': {

                    const { data } = await this.http.send(
                      'POST',
                      `https://graphql.epicgames.com/graphql`,
                      `${this.launcher.account.auth.tokenType} ${this.launcher.account.auth.accessToken}`,
                      JSON.stringify({"query":`
                      query FriendsQuery($displayNames: Boolean!) {
                        Friends {
                            summary(displayNames: $displayNames) {
                                friends { 
                                    alias
                                    note 
                                    favorite
                                    ...friendFields
                                }
                                incoming { 
                                    ...friendFields
                                }
                                outgoing { 
                                    ...friendFields
                                }
                                blocklist { 
                                    ...friendFields
                                }
                            }
                        }
                    }
                    fragment friendFields on Friend {
                        accountId 
                        displayName 
                        account {
                            externalAuths { 
                                type 
                                accountId 
                                externalAuthId 
                                externalDisplayName 
                            }
                        }
                    }
                      `,"variables":{'displayNames': true}}),
                      false,
                      {
                        'Content-Type': "application/json"
                      },
                      true,
                      )

                      return JSON.parse(data).data.Friends.summary.friends;
                  }

                  case 'PresenceV2' || 'PresenceV2Query' || 'Presence' || 'PresenceQuery': {
                    const { data } = await this.http.send(
                      'POST',
                      `https://graphql.epicgames.com/graphql`,
                      `bearer ${this.auth.accessToken}`,
                      JSON.stringify({"query":`query PresenceV2Query($namespace: String!, $circle: String!) { PresenceV2 { getLastOnlineSummary(namespace: $namespace, circle: $circle) { summary { friendId last_online } } } }`,"variables":{ 'namespace': 'Fortnite', 'circle': 'friends' }}),
                      false,
                      {
                        'Content-Type': "application/json"
                      },
                      true,
                      )

                      return JSON.parse(data).data.PresenceV2.getLastOnline.summary;
                  }

                  case 'initialize_friends_request' || 'initialize friends request': {
                    
                    const { data } = await this.http.send(
                      'POST',
                      `https://graphql.epicgames.com/graphql`,
                      `${this.launcher.account.auth.tokenType} ${this.launcher.account.auth.accessToken}`,
                      JSON.stringify({"query":`
                      query FriendsQuery($displayNames: Boolean!) {
                        Friends {
                            summary(displayNames: $displayNames) {
                                friends { 
                                    alias
                                    note 
                                    favorite
                                    ...friendFields
                                }
                                incoming { 
                                    ...friendFields
                                }
                                outgoing { 
                                    ...friendFields
                                }
                                blocklist { 
                                    ...friendFields
                                }
                            }
                        }
                    }
                    fragment friendFields on Friend {
                        accountId 
                        displayName 
                        account {
                            externalAuths { 
                                type 
                                accountId 
                                externalAuthId 
                                externalDisplayName 
                            }
                        }
                    }
                      `,"variables":{'displayNames': true}}),
                      false,
                      {
                        'Content-Type': "application/json"
                      },
                      true,
                      )

                      const Presence = await this.http.send(
                        'POST',
                        `https://graphql.epicgames.com/graphql`,
                        `bearer ${this.auth.accessToken}`,
                        JSON.stringify({"query":`query PresenceV2Query($namespace: String!, $circle: String!) { PresenceV2 { getLastOnlineSummary(namespace: $namespace, circle: $circle) { summary { friendId last_online } } } }`,"variables":{ 'namespace': 'Fortnite', 'circle': 'friends' }}),
                        false,
                        {
                          'Content-Type': "application/json"
                        },
                        true,
                        )

                      return Presence, JSON.parse(data).data.Friends.summary.friends
                    }

                    case 'get' || 'account_graphql_get_by_display_name': {

                        const { data } = await this.http.send(
                          'POST',
                          `https://graphql.epicgames.com/graphql`,
                          `${this.launcher.account.auth.tokenType} ${this.launcher.account.auth.accessToken}`,
                          JSON.stringify({"query":`
                          query AccountQuery($displayName: String!) {
                            Account {
                                account(displayName: $displayName) {
                                    id
                                    displayName
                                    externalAuths {
                                        type
                                        accountId
                                        externalAuthId
                                        externalDisplayName
                                    }
                                }
                            }
                        }
                          `,"variables":{'displayName': info || "Tfue"}}),
                          false,
                          {
                            'Content-Type': "application/json"
                          },
                          true,
                          )
                    
                          return data;
                        }

                        case 'external auths' || 'external_auths' || 'externalauths' || 'account_graphql_get_clients_external_auths': {

                      const { data } = await this.http.send(
                        'POST',
                        `https://graphql.epicgames.com/graphql`,
                        `${this.launcher.account.auth.tokenType} ${this.launcher.account.auth.accessToken}`,
                        JSON.stringify({"query":`
                        query AccountQuery {
                          Account {
                              myAccount { 
                                  externalAuths {
                                      type
                                      accountId
                                      externalAuthId
                                      externalDisplayName
                                  }
                              }
                          }
                      }
                        `}),
                        false,
                        {
                          'Content-Type': "application/json"
                        },
                        true,
                        )

                        return data;
                      }

                      case 'icon': {
                    try {
                      const KairosIds = require("../../enums/Kairos Profiles");

                      const KairosColors = require("../../enums/Kairos Profile Colors");

                      var Color = KairosColors[color] || KairosColors["gray"];

                      var IconId = KairosIds[info] || info;
                      
                      const { data } = await this.http.send(
                        'GET',
                        `${ENDPOINT.CHANNEL}/user/${this.launcher.account.id}/setting/avatar/available`,
                      `${this.launcher.account.auth.tokenType} ${this.launcher.account.auth.accessToken}`,
                      /*
                      JSON.stringify({"query":"query GetUserSettings($key: String!) {    UserSettings {      myAvailableSetting(key: $key)}}","variables":{"key":"avatar"}}),
                      false,
                      {
                        'Content-Type': "application/json"
                      },
                      true,
                      */
                      )

              if(data.includes(IconId)) {

              const datainfo = await this.http.send(
              'POST',
              `${ENDPOINT.CHANNEL}/user/setting?accountId=${this.launcher.account.id}&settingKey=avatar&settingKey=avatarBackground&settingKey=appInstalled`,
              `${this.launcher.account.auth.tokenType} ${this.launcher.account.auth.accessToken}`,
              )

              if(datainfo) {

              if(datainfo.data[0].value == IconId) IconId = false

              if(datainfo.data[1].value == Color) Color = false

              }

              if(IconId != false)
              await this.http.send(
              'PUT',
              `${ENDPOINT.CHANNEL}/user/${this.launcher.account.id}/setting/avatar`,
              `${this.launcher.account.auth.tokenType} ${this.launcher.account.auth.accessToken}`,
              JSON.stringify({ "value": IconId }),
              false,
              {
              'Content-Type': "application/json"
              },
              true,
              )

              if(Color != false)
              await this.http.send(
              'PUT',
              `${ENDPOINT.CHANNEL}/user/${this.launcher.account.id}/setting/avatarBackground`,
              `${this.launcher.account.auth.tokenType} ${this.launcher.account.auth.accessToken}`,
              JSON.stringify({ "value": Color }),
              false,
              {
                'Content-Type': "application/json"
              },
              true,
              )

              return true;   
              }

              else throw new Error ("You don\'t have that avatar!");
              }

              catch (err) {
                  
                this.debug.print(`[graphql(${action}, ${info}, ${color})] Cannot set icon.`);

                this.debug.print(err);

                return false;

                }  
              }

              case 'profile': {

              try {

                const { data } = await this.http.send(
                  'POST',
                  `${ENDPOINT.GRAPHQL}/partyhub/graphql`,
                  `${this.launcher.account.auth.tokenType} ${this.launcher.account.auth.accessToken}`,
                  JSON.stringify({"operationName":"accountQuery","variables":{"id":null,"displayName":displayName,"email":null},"query":"query accountQuery($id: String, $displayName: String, $email: String) {\n  Account {\n    account(id: $id, displayName: $displayName, email: $email) {\n      id\n      displayName\n      friendshipStatus\n      externalAuths {\n        type\n        externalDisplayName\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n"}),
                  false,
                  {
                    'Content-Type': "application/json"
                  },
                  true,
                  )
                  return data;

                }

                catch (err) {
                  
                this.debug.print(`[graphql(${action}, ${info}, ${color})] Cannot accountQuery, use getProfile.`);

                this.debug.print(err);

                }   

              }

              case 'request': {
              try {
              const { data } = await this.http.send(
                'POST',
                `${ENDPOINT.GRAPHQL}/partyhub/graphql`,
                `${this.launcher.account.auth.tokenType} ${this.launcher.account.auth.accessToken}`,
                JSON.stringify(info),
                false,
                {
                  'Content-Type': "application/json"
                },
                true,
                );
                return data;
              }
              catch (err) {
                      
                this.debug.print(`[graphql(${action}, ${info}, ${color})] Cannot request.`);

                this.debug.print(err);

                }

              }

              case 'friend': {
              try {

                const friend = await this.getProfile(id);

                const hasFriend = await this.hasFriend(id);

                if(hasFriend) throw new Error (`Already friended!`);

                if(friend.id == this.launcher.account.id) throw new Error (`You cannont friend yourself!`);

                const { data } = await this.http.send(
                  'POST',
                  `${ENDPOINT.GRAPHQL}/partyhub/graphql`,
                  `${this.launcher.account.auth.tokenType} ${this.launcher.account.auth.accessToken}`,
                  JSON.stringify({"operationName":"inviteFriend","variables":{"friendId":id},"query":"mutation inviteFriend($friendId: String!) {\n  Friends {\n    invite(friendToInvite: $friendId) {\n      success\n      __typename\n    }\n    __typename\n  }\n}\n"}),
                  false,
                  {
                    'Content-Type': "application/json"
                  },
                  true,
                  );
                  
                  return new Friend(this, {
                    id: id,
                    displayName: friend.displayName,
                    status: 'PENDING',
                    time: new Date(),
                  }), data

                    }

                    catch (err) {
                      
                    this.debug.print(`[graphql(${action}, ${info}, ${color})] Cannot inviteFriend, using graphql, use inviteFriend.`);

                    this.debug.print(err);

                    }

                }
              }
  }
  
  async login(isRefresh) {

    try {

      this.launcher.debug.print(`[Fortnite] ${isRefresh ? 'Exchanging refreshed access token...' : 'Exchanging access token...'}`);

      const { code } = await this.launcher.account.auth.exchange();

      if (code) {

        const { data } = await this.launcher.http.sendPost(LauncherEndpoint.OAUTH_TOKEN, `basic ${FORTNITE_AUTHORIZATION}`, {
          grant_type: 'exchange_code',
          exchange_code: code,
          includePerms: false,
          token_type: 'eg1',
        });

        this.auth = {
          accessToken: data.access_token,
          expiresIn: data.expires_in,
          expiresAt: new Date(data.expires_at),
          tokenType: data.token_type,
          refreshToken: data.refresh_token,
          refreshExpires: data.refresh_expires,
          refreshExpiresAt: new Date(data.refresh_expires_at),
          accountId: data.account_id,
          clientId: data.client_id,
          internalClient: data.internal_client,
          clientService: data.client_service,
          app: data.pp,
          inAppId: data.in_app_id,
          deviceId: data.device_id,
        };

        this.launcher.debug.print(`[Fortnite] ${isRefresh ? 'Refreshed access token exchanged!' : 'Access token exchanged!'}`);

        if (!isRefresh) {
          
          await this.http.send(
            'DELETE',
            'https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/sessions/kill?killType=OTHERS_ACCOUNT_CLIENT_SERVICE',
            `${this.auth.tokenType} ${this.auth.accessToken}`,
          );
          
        }

        await this.refreshStoreCatalog();

        return true;

      }

    } catch (err) {

      throw new Error(err);

    }

    return false;
  }

  async requestMCP(action, profileId, payload, rvn, url) {

    const { data } = await this.http.send(
      'POST',
      `${url || ENDPOINT.MCP_PROFILE}/${this.launcher.account.id}/client/${action}?profileId=${profileId}&rvn=${rvn || -1}&leanResponse=true`,
      `${this.auth.tokenType} ${this.auth.accessToken}`,
      payload || {},
    );

    return data;
  }

  async updateProfile(profileId, payload, rvn) {

    const data = await this.requestMCP('QueryProfile', profileId, payload, rvn);
    const profileChange = data.profileChanges[0];

    switch (profileChange.changeType) {
      
      case 'fullProfileUpdate':
        this.profiles[data.profileId] = profileChange.profile;
        break;

      default:
        this.launcher.debug(`Unknown profile change type: ${profileChange.changeType}`);
        break;

    }
    
  }

  async runSubGame(subGame) {
    
    let game;

    switch (subGame) {

      case ESubGame.SaveTheWorld:
        game = new SaveTheWorldSubGame(this);
        break;

      case ESubGame.BattleRoyale:
        game = new BattleRoyaleSubGame(this);
        break;

      case ESubGame.Creative:
        game = new CreativeSubGame(this);
        break;

      default:
        throw new Error('Unknown subgame!');
      
    }

    await game.init();

    return game;
  }
  
  async refreshBasicData() {

    try {

      const { data } = await this.http.sendGet(ENDPOINT.BASIC_DATA);
                
      if (data) {
        
        this.basicData = data;

        return this.basicData;

      }

    } catch (err) {

      this.launcher.debug.print(err);

    }

    return false;
  }
  
  async refreshStoreCatalog() {

    try {
            
      const { data } = await this.http.sendGet(
        ENDPOINT.STOREFRONT_CATALOG,
        `${this.auth.tokenType} ${this.auth.accessToken}`,
      );

      this.storeCatalog = data;

    } catch (err) {

      this.launcher.debug.print(err);

    }

  }

  async getLink(mnemonic) {

    try {

      const { data } = await this.http.sendGet(
        ENDPOINT.LINKS.replace('{{namespace}}', 'fn').replace('{{mnemonic}}', mnemonic),
        `${this.auth.tokenType} ${this.auth.accessToken}`,
      );
      
      return data;

    } catch (err) {

      this.launcher.debug.print('Cannot get link.');
      this.launcher.debug.print(new Error(err));

    }

    return {};
  }

  get vbucks() {
    
    let sum = 0;
    
    this.inventory.findItemsByClass('Currency').forEach((currency) => {

      switch (currency.templateId) {
        
        case 'Currency:MtxComplimentary':
          sum += currency.quantity;
          break;
        
        case 'Currency:MtxGiveaway':
          sum += currency.quantity;
          break;
          
        case 'Currency:MtxPurchased':
          sum += currency.quantity;
          break;
        
        default:
          this.launcher.debug.print(`Unknown currency with template '${currency.templateId}'`);
          break;

      }

    });

    return sum;
  }

  get giftsHistory() {
    return this.profiles.common_core.stats.attributes.gift_history.gifts.map(gift => ({
      offerId: gift.offerId,
      toAccountId: gift.toAccountId,
      time: new Date(gift.date),
    }));
  }

  get countOfSentGifts() {
    return this.profiles.common_core.stats.attributes.gift_history.num_sent;
  }

  get countOfReceivedGifts() {
    return this.profiles.common_core.stats.attributes.gift_history.num_received;
  }

  get canSendGifts() {
    return this.profiles.common_core.stats.attributes.allowed_to_send_gifts;
  }

  get canReceiveGifts() {
    return this.profiles.common_core.stats.attributes.allowed_to_receive_gifts;
  }

  get usedCreatorTag() {
    if (!this.profiles.common_core.stats.attributes.mtx_affiliate) return false;
    return {
      name: this.profiles.common_core.stats.attributes.mtx_affiliate,
      lastModified: this.profiles.common_core.stats.attributes.mtx_affiliate_set_time,
    };
  }

  get countUsedRefunds() {
    return this.profiles.common_core.stats.attributes.mtx_purchase_history.refundsUsed;
  }

  get countPossibleRefunds() {
    return this.profiles.common_core.stats.attributes.mtx_purchase_history.refundCredits;
  }

  get purchasesHistory() {
    return this.profiles.common_core.stats.attributes.mtx_purchase_history.purchases.map(purchase => ({
      purchaseId: purchase.purchaseId,
      offerId: purchase.offerId,
      purchaseDate: new Date(purchase.purchaseDate),
      refundDate: purchase.refundDate ? new Date(purchase.refundDate) : null,
      isRefunded: !!purchase.refundDate,
      fulfillments: purchase.fulfillments,
      paid: purchase.totalMtxPaid,
      lootResult: purchase.lootResult.map(item => new Item(this, {
        id: item.itemGuid,
        templateId: item.itemType,
        /* itemProfile: item.itemProfile, */
        quantity: item.quantity,
      })),
    }));
  }

}

module.exports = App;
