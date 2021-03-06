import socket from '../../../socket';
import { throttle } from 'lodash/function';
import redraw from '../../../utils/redraw';
import router from '../../../router';
import * as utils from '../../../utils';
import * as xhr from '../tournamentXhr';
import * as helper from '../../helper';
import * as m from 'mithril';
import faq from '../faq';
import playerInfo from '../playerInfo';

export default function oninit(vnode) {
  helper.analyticsTrackView('Tournament details');

  const id = vnode.attrs.id;

  const tournament = m.prop();
  const hasJoined = m.prop(false);
  const currentPage = m.prop(null);
  const isLoading = m.prop(false);
  const faqCtrl = faq.controller(tournament);
  const playerInfoCtrl = playerInfo.controller(tournament);

  function reload(data) {
    isLoading(false);
    const oldData = tournament();
    if (data.featured && (data.featured.id !== oldData.featured.id)) {
      socket.send('startWatching', data.featured.id);
    }
    else if (data.featured && (data.featured.id === oldData.featured.id)) {
      data.featured = oldData.featured;
    }
    tournament(data);
    hasJoined(data.me && !data.me.withdraw);

    if (data.socketVersion) {
      socket.setVersion(data.socketVersion);
    }
    redraw();
  }

  function tick() {
    const data = tournament();
    if (data.secondsToStart && data.secondsToStart > 0) {
      data.secondsToStart--;
    }
    if (data.secondsToFinish && data.secondsToFinish > 0) {
      data.secondsToFinish--;
    }
    redraw();
  }

  function join(tid) {
    xhr.join(tid)
    .then(() => {
      hasJoined(true);
      currentPage(null); // Reset the page so next reload goes to player position
      redraw();
    })
    .catch(utils.handleXhrError);
  }

  function withdraw(tid) {
    xhr.withdraw(tid)
    .then(() => {
      hasJoined(false);
      redraw();
    })
    .catch(utils.handleXhrError);
  }

  const throttledReload = throttle((tid, p) => {
    if (p) currentPage(p);
    isLoading(true);
    xhr.reload(tid, currentPage())
    .then(reload)
    .catch(() => isLoading(false));
  }, 1000);

  const handlers = {
    reload: () => throttledReload(id),
    resync: () => throttledReload(id),
    redirect: function(gameId) {
      router.set('/tournament/' + tournament().id + '/game/' + gameId, true);
    },
    fen: function(d) {
      const featured = tournament().featured;
      if (!featured) return;
      if (featured.id !== d.id) return;
      featured.fen = d.fen;
      featured.lastMove = d.lm;
      redraw();
    }
  };

  const clockInterval = m.prop();
  xhr.tournament(id)
  .then(data => {
    tournament(data);
    hasJoined(data.me && !data.me.withdraw);
    clockInterval(setInterval(tick, 1000));
    const featuredGame = data.featured ? data.featured.id : null;
    socket.createTournament(id, tournament().socketVersion, handlers, featuredGame);
    redraw();
  })
  .catch(utils.handleXhrError);

  vnode.state = {
    tournament,
    hasJoined,
    faqCtrl,
    playerInfoCtrl,
    join: throttle(join, 1000),
    withdraw: throttle(withdraw, 1000),
    reload: throttledReload,
    first() {
      const p = tournament().standing.page;
      if (!isLoading() && p > 1) throttledReload(id, 1);
    },
    prev() {
      const p = tournament().standing.page;
      if (!isLoading() && p > 1) throttledReload(id, p - 1);
    },
    next() {
      const p = tournament().standing.page;
      const nbPlayers = tournament().nbPlayers;
      if (!isLoading() && p < nbPlayers / 10) throttledReload(id, p + 1);
    },
    last() {
      const p = tournament().standing.page;
      const nbPlayers = tournament().nbPlayers;
      if (!isLoading() && p < nbPlayers / 10) throttledReload(id, Math.ceil(nbPlayers / 10));
    },
    me() {
      const me = tournament().me;
      if (!isLoading() && me) throttledReload(id, Math.ceil(me.rank / 10));
    },
    isLoading,
    clockInterval
  };
}
