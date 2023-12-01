import React from 'react';
import { Card, CardContent, Typography, Avatar, Link, Grid } from '@mui/material';
import "../css/TeamMemberCard.css"

const TeamMemberCard = ({ name, role, imageUrl, linkedInUrl }) => {
  return (
    <Grid item xs={12} sm={4} md={4}>
      <Card raised>
        <CardContent className="team-card-content">
            <Avatar src={imageUrl} alt={name} className="team-avatar" style={{width: "70px", height: "70px"}}/>
            <div className="team-info">
            <Typography variant="h6" className="team-name">{name}</Typography>
            <Typography variant="subtitle1" className="team-role">{role}</Typography>
            <Link href={linkedInUrl} target="_blank" rel="noopener" className="team-linkedin">
                LinkedIn
            </Link>
            </div>
        </CardContent>
     </Card>
    </Grid>
  );
};
export default TeamMemberCard;