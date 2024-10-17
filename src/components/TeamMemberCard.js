import React from 'react';
import { styled } from '@mui/material/styles';
import { Card, CardContent, Typography, Avatar, Link, Grid, CardActions } from '@mui/material';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import "../css/TeamMemberCard.css"

const ExpandMore = styled((props) => {
  const { expand, ...other } = props;
  return <IconButton {...other} />;
})(({ theme }) => ({
  marginLeft: 'auto',
  transition: theme.transitions.create('transform', {
    duration: theme.transitions.duration.shortest,
  }),
  variants: [
    {
      props: ({ expand }) => !expand,
      style: {
        transform: 'rotate(0deg)',
      },
    },
    {
      props: ({ expand }) => !!expand,
      style: {
        transform: 'rotate(180deg)',
      },
    },
  ],
}));

const TeamMemberCard = ({ name, role, imageUrl, linkedInUrl, bio }) => {
  const [expanded, setExpanded] = React.useState(false);

  const handleExpandClick = () => {
    setExpanded(!expanded);
  };


  return (
    <Grid item xs={12} sm={4} md={4}>
      <Card raised   sx={{':hover': {boxShadow: 20,},}}>
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
        <CardActions>
          <ExpandMore
            expand={expanded}
            onClick={handleExpandClick}
            aria-expanded={expanded}
            aria-label="show more"
          >
            <ExpandMoreIcon />
          </ExpandMore>
        </CardActions>
        <Collapse in={expanded} timeout="auto" unmountOnExit>
        <CardContent>
          {bio}
        </CardContent>
        </Collapse>
     </Card>
    </Grid>
  );
};
export default TeamMemberCard;