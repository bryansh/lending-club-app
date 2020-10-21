/*jshint esversion: 6 */

exports.scoreLoan = function scoreLoan(loan) {
  const score = (1 - (loan.installment / (loan.annualInc / 12))) * 100;

  let modifier = loan.grade.charCodeAt(0) - 'C'.charCodeAt(0) + (Number(loan.subGrade[1]) * 0.33);

  if (loan.homeOwnership == 'OWN' && loan.delinq2Yrs === 0) {
    modifier *= 2;
  }

  if (loan.delinq2Yrs > 0) {
    modifier /= (loan.delinq2Yrs + ((loan.delinq2Yrs + loan.delinq2Yrs) * (1 - loan.mthsSinceLastDelinq / 24)));
  }

  return score * modifier;
};
