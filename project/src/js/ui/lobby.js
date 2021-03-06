import * as utils from '../utils';
import redraw from '../utils/redraw';
import * as helper from './helper';
import backbutton from '../backbutton';
import { loader } from './shared/common';
import popupWidget from './shared/popup';
import * as xhr from '../xhr';
import i18n from '../i18n';
import socket from '../socket';
import * as m from 'mithril';

let nbPlayers = 0;
let nbGames = 0;
let hookId = null;

const lobby = {};
lobby.isOpen = false;

lobby.startSeeking = function() {
  backbutton.stack.push(lobby.cancelSeeking);

  lobby.isOpen = true;
  window.plugins.insomnia.keepAwake();
  hookId = null;

  xhr.lobby(true).then(data => {
    socket.createLobby(data.lobby.version, createHook, {
      redirect: d => {
        lobby.closePopup();
        helper.analyticsTrackEvent('Seek', 'Found');
        socket.redirectToGame(d);
      },
      n: (_, d) => {
        nbPlayers = d.d;
        nbGames = d.r;
        redraw();
      },
      resync: () => xhr.lobby().then(d => {
        socket.setVersion(d.lobby.version);
      })
    });
  });
};

lobby.closePopup = function(fromBB) {
  if (fromBB !== 'backbutton' && lobby.isOpen) backbutton.stack.pop();
  lobby.isOpen = false;
};

lobby.cancelSeeking = function(fromBB) {
  lobby.closePopup(fromBB);

  if (hookId) socket.send('cancel', hookId);
  hookId = null;

  window.plugins.insomnia.allowSleepAgain();

  socket.restorePrevious();

  helper.analyticsTrackEvent('Seek', 'Canceled');
};

lobby.view = function() {
  const nbPlayersStr = i18n('nbConnectedPlayers', nbPlayers || '?');
  const nbGamesStr = i18n('nbGamesInPlay', nbGames || '?');
  function content() {
    return m('div.seek_real_time', [
      m('div.nb_players', socket.isConnected() ?
        m.trust(nbPlayersStr.replace(/(\d+)/, '<strong>$1</strong>')) :
        m('div', [i18n('reconnecting'), loader])
      ),
      m('div.nb_players', socket.isConnected() ?
        m.trust(nbGamesStr.replace(/(\d+)/, '<strong>$1</strong>')) :
        m('div', [i18n('reconnecting'), loader])
      ),
      m('br'),
      m('br'),
      m('button[data-icon=L]', {
        oncreate: helper.ontap(lobby.cancelSeeking)
      }, i18n('cancel'))
    ]);
  }

  return popupWidget(
    null,
    () => m('div', i18n('waitingForOpponent') + '...'),
    content,
    lobby.isOpen
  );
};

function createHook() {
  if (hookId) return; // hook already created!
  xhr.seekGame()
  .then(data => {
    helper.analyticsTrackEvent('Seek', 'Created');
    hookId = data.hook.id;
  })
  .catch(utils.handleXhrError);
}

export default lobby;
