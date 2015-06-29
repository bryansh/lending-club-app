var lc = require('node-lending-club-api');
var nconf  = require('nconf');
var moment = require('moment');

nconf.argv().file('global', './global.json').env();

var minLowScore = nconf.get('minLowScore') || 103;

lc.init({ apiKey: nconf.get('apiKey') });

lc.loans.listing(true, function(err, data) {
  handleError(err);

  var investorId = nconf.get('investorId');
  var loansOfInterest = [];

  for (var i = 0; i < data.loans.length; i++) {
    if (matchesCriteria(data.loans[i])) {
      loansOfInterest.push({
        loan: data.loans[i],
        loanScore: scoreLoan(data.loans[i])
      });
    }
  }

  loansOfInterest.sort(function(a, b) {
    if (a.loanScore > b.loanScore) {
      return -1;
    } else if (a.loanScore < b.loanScore) {
      return 1;
    } else {
      return 0;
    }
  });

  lc.accounts.availableCash(investorId, function(err, data) {
    handleError(err);

    console.log('Funds available: ' + data.availableCash);

    var loansToInvestIn = Math.floor(data.availableCash / nconf.get('amountToInvest'));

    lc.accounts.notes(investorId, function(err, data) {
      handleError(err);
      var loansOwned = {};
      
      for (var i = 0; i < data.myNotes.length; i++) {
        loansOwned[data.myNotes[i].loanId] = 1;
      }

      var loansToBuy = [];

      console.log('Found ' + loansOfInterest.length + ' loans of interest')

      for (var i = 0; i < loansOfInterest.length; i++) {
        var reason = 'would buy';

        if (loansOwned[loansOfInterest[i].loan.id]) {
          reason = 'already owned';
        } else if (loansOfInterest[i].loanScore < minLowScore) {
          reason = 'low scoring loan';
        } else if (!(loansToInvestIn > 0 && loansToBuy.length < loansToInvestIn)) {
          reason = 'out of budget';
        } else {
          loansToBuy.push(loansOfInterest[i]);
        }

        console.log(loanIdToUrl(loansOfInterest[i].loan.id), loansOfInterest[i].loanScore, reason);
      }

      if (nconf.get('buy') && loansToBuy.length) {
        console.log('Buying ' + loansToBuy.length + ' loans.');

        var portfolioName = moment().format('YYYY-MM-DD');

        lc.accounts.createPortfolio(investorId, investorId, portfolioName, null, function(err, data) {
          handleError(err);

          var portfolioId = data.portfolioId;
          var orders = [];

          for (var i = 0; i < loansToBuy.length; i++) {
            orders.push(lc.accounts.createOrderObject(loansToBuy[i].loan.id,
              nconf.get('amountToInvest'),
              portfolioId));
          }

          lc.accounts.submitOrder(investorId, orders, function(err, res) {
            handleError(err);

            console.log(JSON.stringify(res));
          });
        });
      } else if (loansToBuy.lengh > 0) {
        console.log('*** Virtual Mode (to act, pass the --buy flag) ***');
        console.log('Would have purchased: ');

        for (var i = 0; i < loansToBuy.length; i++) {
          console.log(loanIdToUrl(loansToBuy[i].loan.id));
        }
      }
    });
  });
});

function scoreLoan(loan) {
  var score = (1 - (loan.installment / (loan.annualInc / 12))) * 100;

  var modifier = loan.grade.charCodeAt(0) - 'C'.charCodeAt(0) + (Number(loan.subGrade[1]) * .15);

  if (loan.homeOwnership == 'OWN' && loan.delinq2Yrs == 0) {
    modifier *= 2;
  }

  if (loan.delinq2Yrs > 0) {
    modifier /= (loan.delinq2Yrs + ((loan.delinq2Yrs + loan.delinq2Yrs) * (1 - loan.mthsSinceLastDelinq / 24)));
  }

  return score * modifier;
}

function matchesCriteria(loan) {
  if (loan.empLength < 47) {
    return false;
  }

  if (loan.grade < 'D') {
    return false;
  }

  if (loan.addrState == 'CA') {
    return false;
  }

  if (loan.homeOwnership == 'RENT') {
    return false;
  }

  if (loan.totalAcc < 6) {
    return false;
  }

  if (!(loan.purpose == 'debt_consolidation' || loan.purpose == 'wedding' || loan.purpose == 'moving' || loan.purpose == 'house')) {
    return false;
  }

  if (loan.accNowDelinq != 0) {
    return false;
  }

  if (loan.chargeoffWithin12Mths != 0) {
    return false;
  }

  if (loan.pubRecBankruptcies != 0) {
    return false;
  }

  if (loan.taxLiens != 0) {
    return false;
  }

  if (loan.accNowDelinq != 0) {
    return false;
  }

  if (loan.installment / (loan.annualInc / 12) > 0.1075 ) {
    return false;
  }

  if (loan.annualInc > 120000) {
    return false;
  }

  return true;
}

function handleError(err) {
  if (err) {
    throw err;
  }
}

function loanIdToUrl(loanId) {
  return 'https://www.lendingclub.com/browse/loanDetail.action?loan_id=' + loanId;
}