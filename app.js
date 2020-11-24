const lc = require('node-lending-club-api')
const loanUtils = require('./lib/loanUtils')
const nconf = require('nconf')
const moment = require('moment')
const winston = require('winston')

nconf.argv().file('global', './global.json').env()

const logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)()
  ]
})

const minLoanScore = Number(nconf.get('minLoanScore')) || 70

lc.init({ apiKey: nconf.get('apiKey') })

lc.loans.listing(true, (err, data) => {
  handleError(err)

  logger.info(data.loans.length + ' loans being funded')

  const investorId = nconf.get('investorId')
  const loansOfInterest = []
  const rejections = {}

  for (let i = 0; i < data.loans.length; i++) {
    if (matchesCriteria(data.loans[i], rejections)) {
      loansOfInterest.push({
        loan: data.loans[i],
        loanScore: loanUtils.scoreLoan(data.loans[i])
      })
    }
  }

  logger.info(loansOfInterest.length, ' interesting loans')
  if (loansOfInterest.length === 0) {
    logger.info(rejections)
  }

  loansOfInterest.sort((a, b) => {
    if (a.loanScore > b.loanScore) {
      return -1
    } else if (a.loanScore < b.loanScore) {
      return 1
    } else {
      return 0
    }
  })

  lc.accounts.availableCash(investorId, (err, data) => {
    handleError(err)

    logger.info('Funds available: ' + data.availableCash)

    const loansToInvestIn = Math.floor(data.availableCash / nconf.get('amountToInvest'))

    lc.accounts.notes(investorId, (err, data) => {
      handleError(err)
      const loansOwned = {}
      const loansToBuy = []

      for (let i = 0; i < data.myNotes.length; i++) {
        loansOwned[data.myNotes[i].loanId] = 1
      }

      logger.info('Found ' + loansOfInterest.length + ' loans of interest')

      for (let i = 0; i < loansOfInterest.length; i++) {
        let reason = 'would buy'

        if (loansOwned[loansOfInterest[i].loan.id]) {
          reason = 'already owned'
        } else if (loansOfInterest[i].loanScore < minLoanScore) {
          reason = 'low scoring loan'
        } else if (!(loansToInvestIn > 0 && loansToBuy.length < loansToInvestIn)) {
          reason = 'out of budget'
        } else {
          loansToBuy.push(loansOfInterest[i])
        }

        logger.info(loanIdToUrl(loansOfInterest[i].loan.id), loansOfInterest[i].loanScore, reason)
      }

      if (nconf.get('buy') && loansToBuy.length) {
        logger.info('Buying ' + loansToBuy.length + ' loans.')

        const portfolioName = moment().format('YYYY-MM-DD')

        lc.accounts.createPortfolio(investorId, investorId, portfolioName, null, (err, data) => {
          handleError(err)

          const portfolioId = data.portfolioId
          const orders = []

          for (let i = 0; i < loansToBuy.length; i++) {
            orders.push(lc.accounts.createOrderObject(loansToBuy[i].loan.id,
              nconf.get('amountToInvest'),
              portfolioId))
          }

          lc.accounts.submitOrder(investorId, orders, (err, res) => {
            handleError(err)

            logger.info(JSON.stringify(res))
          })
        })
      } else if (loansToBuy.lengh > 0) {
        logger.info('*** Virtual Mode (to act, pass the --buy flag) ***')
        logger.info('Would have purchased: ')

        for (let i = 0; i < loansToBuy.length; i++) {
          logger.info(loanIdToUrl(loansToBuy[i].loan.id))
        }
      }
    })
  })
})

function matchesCriteria (loan, rejections) {
  if (loan.empLength < 36) {
    if (!rejections.empLength) {
      rejections.empLength = 1
    } else {
      rejections.empLength++
    }

    return false
  }

  if (loan.grade < 'C') {
    if (!rejections.loanGrade) {
      rejections.loanGrade = 1
    } else {
      rejections.loanGrade++
    }

    return false
  }

  if (loan.addrState === 'CA') {
    if (!rejections.california) {
      rejections.california = 1
    } else {
      rejections.california++
    }

    return false
  }

  if (loan.homeOwnership === 'RENT') {
    if (!rejections.homeOwner) {
      rejections.homeOwner = 1
    } else {
      rejections.homeOwner++
    }

    return false
  }

  if (loan.totalAcc < 6) {
    if (!rejections.totalAccounts) {
      rejections.totalAccounts = 1
    } else {
      rejections.totalAccounts++
    }

    return false
  }

  if (!(loan.purpose === 'debt_consolidation' || loan.purpose === 'wedding' || loan.purpose === 'moving' || loan.purpose === 'house')) {
    if (!rejections.purpose) {
      rejections.purpose = 1
    } else {
      rejections.purpose++
    }

    return false
  }

  if (loan.accNowDelinq !== 0) {
    if (!rejections.delinquentAccounts) {
      rejections.delinquentAccounts = 1
    } else {
      rejections.delinquentAccounts++
    }

    return false
  }

  if (loan.chargeoffWithin12Mths !== 0) {
    if (!rejections.chargedOffLastYear) {
      rejections.chargedOffLastYear = 1
    } else {
      rejections.chargedOffLastYear++
    }

    return false
  }

  if (loan.pubRecBankruptcies !== 0) {
    if (!rejections.publicBankruptcies) {
      rejections.publicBankruptcies = 1
    } else {
      rejections.publicBankruptcies++
    }

    return false
  }

  if (loan.taxLiens !== 0) {
    if (!rejections.taxLiens) {
      rejections.taxLiens = 1
    } else {
      rejections.taxLiens++
    }

    return false
  }

  if (loan.installment / (loan.annualInc / 12) > 0.1075) {
    if (!rejections.installmentincomeratio) {
      rejections.installmentincomeratio = 1
    } else {
      rejections.installmentincomeratio++
    }

    return false
  }

  if (loan.annualInc > 120000) {
    if (!rejections.income) {
      rejections.income = 1
    } else {
      rejections.income++
    }

    return false
  }

  return true
}

function handleError (err) {
  if (err) {
    logger.error(err)
    throw err
  }
}

function loanIdToUrl (loanId) {
  return 'https://www.lendingclub.com/browse/loanDetail.action?loan_id=' + loanId
}
