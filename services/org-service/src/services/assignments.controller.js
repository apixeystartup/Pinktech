const assignmentsService = require("./assignments.service");

async function assignSeat(req, res, next) {
  try {
    const assignment = await assignmentsService.assignSeat(req.tenantId, req.body, req.auth);
    res.status(201).json(assignment);
  } catch (error) {
    next(error);
  }
}

async function listAssignments(req, res, next) {
  try {
    const assignments = await assignmentsService.listAssignments(req.tenantId, req.query);
    res.status(200).json(assignments);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  assignSeat,
  listAssignments,
};
